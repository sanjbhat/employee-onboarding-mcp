import * as fs from 'fs/promises';
import * as path from 'path';

export interface OnboardingStep {
  id: number;
  title: string;
  description: string;
  type: string;
  required: boolean;
  content: string;
  isMarkdown: boolean;
  resources?: string[];
  completionCriteria?: string;
}

export interface OnboardingConfig {
  steps: OnboardingStep[];
}

export class ConfigParser {
  private static configPath: string = process.env.ONBOARDING_CONFIG_PATH || 
    path.join(process.cwd(), 'config');

  /**
   * Load all onboarding configuration from Markdown and HTML files
   */
  static async loadConfiguration(): Promise<OnboardingConfig> {
    const stepsPath = path.join(this.configPath, 'steps');

    const steps = await this.loadSteps(stepsPath);

    return {
      steps: steps.sort((a, b) => a.id - b.id)
    };
  }

  /**
   * Load step configurations from Markdown and HTML files (prefer Markdown)
   */
  private static async loadSteps(stepsPath: string): Promise<OnboardingStep[]> {
    try {
      const files = await fs.readdir(stepsPath);
      const steps: OnboardingStep[] = [];
      const stepIds = new Set<number>();

      // First, load Markdown files
      const markdownFiles = files.filter(f => f.endsWith('.md'));
      for (const file of markdownFiles) {
        try {
          const filePath = path.join(stepsPath, file);
          const content = await fs.readFile(filePath, 'utf-8');
          const step = this.parseStepMarkdown(content, file);
          if (step) {
            steps.push(step);
            stepIds.add(step.id);
          }
        } catch (error) {
          console.warn(`Failed to load step file ${file}:`, error);
        }
      }

      // Then, load HTML files only for steps that don't have Markdown versions
      const htmlFiles = files.filter(f => f.endsWith('.html'));
      for (const file of htmlFiles) {
        try {
          const idMatch = file.match(/step-(\d+)/);
          const id = idMatch ? parseInt(idMatch[1]) : 0;
          
          if (!stepIds.has(id)) {
            const filePath = path.join(stepsPath, file);
            const content = await fs.readFile(filePath, 'utf-8');
            const step = this.parseStepHTML(content, file);
            if (step) {
              steps.push(step);
            }
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
   * Parse individual step Markdown file
   */
  private static parseStepMarkdown(content: string, filename: string): OnboardingStep | null {
    try {
      // Extract step ID from filename (e.g., "step-1-account-setup.md" -> 1)
      const idMatch = filename.match(/step-(\d+)/);
      const id = idMatch ? parseInt(idMatch[1]) : 0;

      // Extract title from first # heading
      const titleMatch = content.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1].trim() : `Step ${id}`;

      // Extract description from content after title and before first ##
      const descMatch = content.match(/^#\s+.+?\n\n(.+?)(?=\n##|\n\n##|$)/s);
      const description = descMatch ? descMatch[1].trim().split('\n')[0] : '';

      // Extract step type and required status from header line
      const headerMatch = content.match(/\*\*Step \d+ of \d+\*\*\s*\|\s*\*\*(.+?)\*\*/);
      const isRequired = headerMatch ? headerMatch[1].toLowerCase().includes('required') : true;
      
      // Default type for markdown files
      const type = 'general';

      // Extract completion criteria section
      const criteriaMatch = content.match(/##\s+This step is complete when:(.*?)(?=\n##|$)/s);
      const completionCriteria = criteriaMatch ? criteriaMatch[1].trim() : undefined;

      // Extract resource links (already in markdown format)
      const resourceLinks = this.extractMarkdownLinks(content);

      return {
        id,
        title,
        description,
        type,
        required: isRequired,
        content: content,
        isMarkdown: true,
        resources: resourceLinks.length > 0 ? resourceLinks : undefined,
        completionCriteria
      };
    } catch (error) {
      console.warn(`Failed to parse step Markdown ${filename}:`, error);
      return null;
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
        content: content,
        isMarkdown: false,
        resources: resourceLinks.length > 0 ? resourceLinks : undefined,
        completionCriteria
      };
    } catch (error) {
      console.warn(`Failed to parse step HTML ${filename}:`, error);
      return null;
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
   * Format step content for AI display
   */
  static formatStepForAI(step: OnboardingStep): string {
    if (step.isMarkdown) {
      // For Markdown files, return the content as-is since it's already properly formatted
      return step.content;
    } else {
      // For HTML files, convert to readable text format
      let formatted = `# ${step.title}\n\n`;
      
      if (step.description) {
        formatted += `${step.description}\n\n`;
      }

      // Convert HTML to readable text
      const textContent = this.stripHTML(step.content);
      formatted += textContent;

      return formatted;
    }
  }

  /**
   * Extract resource links from Markdown content
   */
  private static extractMarkdownLinks(markdown: string): string[] {
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    const links: string[] = [];
    let match;

    while ((match = linkRegex.exec(markdown)) !== null) {
      const text = match[1];
      const url = match[2];
      links.push(`[${text}](${url})`);
    }

    return links;
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
