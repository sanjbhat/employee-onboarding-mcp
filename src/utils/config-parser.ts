import * as fs from 'fs/promises';
import * as path from 'path';

export interface OnboardingStep {
  id: number;
  title: string;
  description: string;
  type: string;
  required: boolean;
  htmlContent: string;
  resources?: string[];
  completionCriteria?: string;
}

export interface OnboardingConfig {
  steps: OnboardingStep[];
  resources: Record<string, string>;
  templates: Record<string, string>;
}

export class ConfigParser {
  private static configPath: string = process.env.ONBOARDING_CONFIG_PATH || 
    path.join(process.cwd(), 'config');

  /**
   * Load all onboarding configuration from HTML files
   */
  static async loadConfiguration(): Promise<OnboardingConfig> {
    const stepsPath = path.join(this.configPath, 'steps');
    const resourcesPath = path.join(this.configPath, 'resources');
    const templatesPath = path.join(this.configPath, 'templates');

    const [steps, resources, templates] = await Promise.all([
      this.loadSteps(stepsPath),
      this.loadResources(resourcesPath),
      this.loadTemplates(templatesPath)
    ]);

    return {
      steps: steps.sort((a, b) => a.id - b.id),
      resources,
      templates
    };
  }

  /**
   * Load step configurations from HTML files
   */
  private static async loadSteps(stepsPath: string): Promise<OnboardingStep[]> {
    try {
      const files = await fs.readdir(stepsPath);
      const htmlFiles = files.filter(f => f.endsWith('.html'));
      const steps: OnboardingStep[] = [];

      for (const file of htmlFiles) {
        try {
          const filePath = path.join(stepsPath, file);
          const content = await fs.readFile(filePath, 'utf-8');
          const step = this.parseStepHTML(content, file);
          if (step) {
            steps.push(step);
          }
        } catch (error) {
          console.warn(`Failed to load step file ${file}:`, error);
        }
      }

      return steps;
    } catch (error) {
      console.warn('Failed to load steps directory:', error);
      return [];
    }
  }

  /**
   * Parse individual step HTML file
   */
  private static parseStepHTML(content: string, filename: string): OnboardingStep | null {
    try {
      // Extract step ID from filename (e.g., "step-1-account-setup.html" -> 1)
      const idMatch = filename.match(/step-(\d+)/);
      const id = idMatch ? parseInt(idMatch[1]) : 0;

      // Extract title from h1 or h2 tag
      const titleMatch = content.match(/<h[12][^>]*>([^<]+)<\/h[12]>/i);
      const title = titleMatch ? titleMatch[1].trim() : `Step ${id}`;

      // Extract description from first paragraph
      const descMatch = content.match(/<p[^>]*>([^<]+)<\/p>/i);
      const description = descMatch ? descMatch[1].trim() : '';

      // Extract step type from data attribute
      const typeMatch = content.match(/data-step-type="([^"]+)"/);
      const type = typeMatch ? typeMatch[1] : 'general';

      // Check if required
      const requiredMatch = content.match(/data-required="(true|false)"/);
      const required = requiredMatch ? requiredMatch[1] === 'true' : true;

      // Extract completion criteria
      const criteriaMatch = content.match(/<div[^>]*class="completion-criteria"[^>]*>(.*?)<\/div>/is);
      const completionCriteria = criteriaMatch ? this.stripHTML(criteriaMatch[1]).trim() : undefined;

      // Extract resource links
      const resourceLinks = this.extractResourceLinks(content);

      return {
        id,
        title,
        description,
        type,
        required,
        htmlContent: content,
        resources: resourceLinks.length > 0 ? resourceLinks : undefined,
        completionCriteria
      };
    } catch (error) {
      console.warn(`Failed to parse step HTML ${filename}:`, error);
      return null;
    }
  }

  /**
   * Load resource HTML files
   */
  private static async loadResources(resourcesPath: string): Promise<Record<string, string>> {
    try {
      const files = await fs.readdir(resourcesPath);
      const htmlFiles = files.filter(f => f.endsWith('.html'));
      const resources: Record<string, string> = {};

      for (const file of htmlFiles) {
        try {
          const filePath = path.join(resourcesPath, file);
          const content = await fs.readFile(filePath, 'utf-8');
          const resourceName = path.basename(file, '.html');
          resources[resourceName] = content;
        } catch (error) {
          console.warn(`Failed to load resource file ${file}:`, error);
        }
      }

      return resources;
    } catch (error) {
      console.warn('Failed to load resources directory:', error);
      return {};
    }
  }

  /**
   * Load template HTML files
   */
  private static async loadTemplates(templatesPath: string): Promise<Record<string, string>> {
    try {
      const files = await fs.readdir(templatesPath);
      const htmlFiles = files.filter(f => f.endsWith('.html'));
      const templates: Record<string, string> = {};

      for (const file of htmlFiles) {
        try {
          const filePath = path.join(templatesPath, file);
          const content = await fs.readFile(filePath, 'utf-8');
          const templateName = path.basename(file, '.html');
          templates[templateName] = content;
        } catch (error) {
          console.warn(`Failed to load template file ${file}:`, error);
        }
      }

      return templates;
    } catch (error) {
      console.warn('Failed to load templates directory:', error);
      return {};
    }
  }

  /**
   * Get specific step by ID
   */
  static async getStep(stepId: number): Promise<OnboardingStep | null> {
    const config = await this.loadConfiguration();
    return config.steps.find(step => step.id === stepId) || null;
  }

  /**
   * Get all steps
   */
  static async getAllSteps(): Promise<OnboardingStep[]> {
    const config = await this.loadConfiguration();
    return config.steps;
  }

  /**
   * Get resource content by name
   */
  static async getResource(resourceName: string): Promise<string | null> {
    const config = await this.loadConfiguration();
    return config.resources[resourceName] || null;
  }

  /**
   * Format step content for AI display
   */
  static formatStepForAI(step: OnboardingStep): string {
    let formatted = `# ${step.title}\n\n`;
    
    if (step.description) {
      formatted += `${step.description}\n\n`;
    }

    // Convert HTML to readable text
    const textContent = this.stripHTML(step.htmlContent);
    formatted += textContent;

    if (step.completionCriteria) {
      formatted += `\n\n**Completion Criteria:** ${step.completionCriteria}`;
    }

    if (step.resources && step.resources.length > 0) {
      formatted += `\n\n**Resources:**\n`;
      step.resources.forEach(resource => {
        formatted += `- ${resource}\n`;
      });
    }

    return formatted;
  }

  /**
   * Extract resource links from HTML content
   */
  private static extractResourceLinks(html: string): string[] {
    const linkRegex = /<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
    const links: string[] = [];
    let match;

    while ((match = linkRegex.exec(html)) !== null) {
      const url = match[1];
      const text = match[2];
      links.push(`[${text}](${url})`);
    }

    return links;
  }

  /**
   * Strip HTML tags and return clean text
   */
  private static stripHTML(html: string): string {
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Reload configuration (useful for development)
   */
  static async reloadConfiguration(): Promise<OnboardingConfig> {
    return this.loadConfiguration();
  }
}
