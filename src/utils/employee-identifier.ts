import * as os from 'os';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface EmployeeProfile {
  email: string;
  name: string;
  startDate: string;
  buddyEmail?: string;
  department?: string;
  currentStep: number;
  completedSteps: number[];
  stepData: Record<string, any>;
  metadata: {
    createdAt: string;
    lastUpdated: string;
    version: string;
  };
}

export class EmployeeIdentifier {
  private static dataPath: string = process.env.ONBOARDING_DATA_PATH || 
    path.join(process.cwd(), 'data', 'employees');

  /**
   * Get the current employee's email using various detection methods
   */
  static async getCurrentEmployeeEmail(): Promise<string> {
    // Method 1: Check environment variables (corporate setup)
    const envEmail = process.env.USER_EMAIL || 
                     process.env.USERPRINCIPALNAME || 
                     process.env.OFFICE_365_EMAIL;
    
    if (envEmail && this.isValidEmail(envEmail)) {
      return envEmail.toLowerCase();
    }
    
    // Method 2: Check Windows domain user
    const username = process.env.USERNAME;
    const domain = process.env.USERDOMAIN;
    
    if (username && domain && domain !== username) {
      // Common corporate email patterns
      const possibleEmails = [
        `${username}@${domain.toLowerCase()}.com`,
        `${username}@${domain.toLowerCase()}.onmicrosoft.com`,
        `${username}@company.com` // fallback
      ];
      
      for (const email of possibleEmails) {
        if (this.isValidEmail(email)) {
          return email;
        }
      }
    }
    
    // Method 3: Check for existing profile files (return most recent)
    try {
      const files = await fs.readdir(this.dataPath);
      const jsonFiles = files.filter(f => f.endsWith('.json') && f !== 'progress-index.json');
      
      if (jsonFiles.length === 1) {
        // Only one profile exists, assume it's this user
        return jsonFiles[0].replace('.json', '');
      }
    } catch (error) {
      // Data directory doesn't exist yet, that's fine
    }
    
    // Method 4: Interactive registration required
    throw new Error('REGISTRATION_REQUIRED');
  }

  /**
   * Get or create employee profile
   */
  static async getEmployeeProfile(email?: string): Promise<EmployeeProfile> {
    const employeeEmail = email || await this.getCurrentEmployeeEmail();
    const profilePath = path.join(this.dataPath, `${employeeEmail}.json`);
    
    try {
      const data = await fs.readFile(profilePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      // Profile doesn't exist, create new one
      return this.createNewProfile(employeeEmail);
    }
  }

  /**
   * Create a new employee profile
   */
  static async createNewProfile(email: string, additionalInfo?: Partial<EmployeeProfile>): Promise<EmployeeProfile> {
    const profile: EmployeeProfile = {
      email: email.toLowerCase(),
      name: additionalInfo?.name || this.extractNameFromEmail(email),
      startDate: new Date().toISOString(),
      buddyEmail: additionalInfo?.buddyEmail,
      department: additionalInfo?.department,
      currentStep: 1,
      completedSteps: [],
      stepData: {},
      metadata: {
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        version: '1.0'
      }
    };

    await this.saveEmployeeProfile(profile);
    return profile;
  }

  /**
   * Save employee profile to disk
   */
  static async saveEmployeeProfile(profile: EmployeeProfile): Promise<void> {
    // Ensure data directory exists
    await fs.mkdir(this.dataPath, { recursive: true });
    
    // Update metadata
    profile.metadata.lastUpdated = new Date().toISOString();
    
    const profilePath = path.join(this.dataPath, `${profile.email}.json`);
    await fs.writeFile(profilePath, JSON.stringify(profile, null, 2));
    
    // Update progress index
    await this.updateProgressIndex();
  }

  /**
   * Update the progress index file for quick lookups
   */
  private static async updateProgressIndex(): Promise<void> {
    try {
      const files = await fs.readdir(this.dataPath);
      const profiles: Array<{ email: string; currentStep: number; lastUpdated: string }> = [];
      
      for (const file of files) {
        if (file.endsWith('.json') && file !== 'progress-index.json') {
          try {
            const profilePath = path.join(this.dataPath, file);
            const data = await fs.readFile(profilePath, 'utf-8');
            const profile: EmployeeProfile = JSON.parse(data);
            
            profiles.push({
              email: profile.email,
              currentStep: profile.currentStep,
              lastUpdated: profile.metadata.lastUpdated
            });
          } catch (error) {
            console.warn(`Failed to read profile ${file}:`, error);
          }
        }
      }
      
      const indexPath = path.join(this.dataPath, 'progress-index.json');
      await fs.writeFile(indexPath, JSON.stringify({
        updatedAt: new Date().toISOString(),
        totalEmployees: profiles.length,
        profiles: profiles.sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime())
      }, null, 2));
      
    } catch (error) {
      console.warn('Failed to update progress index:', error);
    }
  }

  /**
   * Get all employee profiles (for onboarding buddies)
   */
  static async getAllProfiles(): Promise<EmployeeProfile[]> {
    try {
      const files = await fs.readdir(this.dataPath);
      const profiles: EmployeeProfile[] = [];
      
      for (const file of files) {
        if (file.endsWith('.json') && file !== 'progress-index.json') {
          try {
            const profilePath = path.join(this.dataPath, file);
            const data = await fs.readFile(profilePath, 'utf-8');
            profiles.push(JSON.parse(data));
          } catch (error) {
            console.warn(`Failed to read profile ${file}:`, error);
          }
        }
      }
      
      return profiles.sort((a, b) => new Date(b.metadata.lastUpdated).getTime() - new Date(a.metadata.lastUpdated).getTime());
    } catch (error) {
      return [];
    }
  }

  /**
   * Validate email format
   */
  private static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Extract likely name from email
   */
  private static extractNameFromEmail(email: string): string {
    const localPart = email.split('@')[0];
    
    // Handle common patterns
    if (localPart.includes('.')) {
      const parts = localPart.split('.');
      return parts.map(part => 
        part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
      ).join(' ');
    }
    
    if (localPart.includes('_')) {
      const parts = localPart.split('_');
      return parts.map(part => 
        part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
      ).join(' ');
    }
    
    // Fallback: capitalize first letter
    return localPart.charAt(0).toUpperCase() + localPart.slice(1).toLowerCase();
  }
}
