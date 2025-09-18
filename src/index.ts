#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import { EmployeeIdentifier, EmployeeProfile } from './utils/employee-identifier.js';
import { ConfigParser, OnboardingStep } from './utils/config-parser.js';

interface StartOnboardingArgs {
  email?: string;
  name?: string;
  buddyEmail?: string;
  department?: string;
}

interface CompleteStepArgs {
  stepId: number;
  email?: string;
  notes?: string;
  data?: Record<string, any>;
}

interface GetProgressArgs {
  email?: string;
}

interface GetEmployeeListArgs {
  buddyEmail?: string;
}

interface UpdateStepConfigArgs {
  stepId: number;
  htmlContent: string;
}

class OnboardingMCPServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'employee-onboarding-mcp',
        version: '1.0.0',
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    
    // Error handling
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
    // List all available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'start_onboarding',
          description: 'Initialize onboarding process for a new employee',
          inputSchema: {
            type: 'object',
            properties: {
              email: {
                type: 'string',
                description: 'Employee email address (optional - will auto-detect if not provided)',
              },
              name: {
                type: 'string',
                description: 'Employee full name (optional - will extract from email if not provided)',
              },
              buddyEmail: {
                type: 'string',
                description: 'Onboarding buddy email address (optional)',
              },
              department: {
                type: 'string',
                description: 'Employee department (optional)',
              },
            },
            required: [],
          },
        },
        {
          name: 'get_current_step',
          description: 'Get the current onboarding step for an employee',
          inputSchema: {
            type: 'object',
            properties: {
              email: {
                type: 'string',
                description: 'Employee email address (optional - will auto-detect if not provided)',
              },
            },
            required: [],
          },
        },
        {
          name: 'complete_step',
          description: 'Mark an onboarding step as completed and advance to next step',
          inputSchema: {
            type: 'object',
            properties: {
              stepId: {
                type: 'number',
                description: 'ID of the step to mark as completed',
              },
              email: {
                type: 'string',
                description: 'Employee email address (optional - will auto-detect if not provided)',
              },
              notes: {
                type: 'string',
                description: 'Optional notes about step completion',
              },
              data: {
                type: 'object',
                description: 'Optional additional data about step completion (e.g., SAW request ID)',
              },
            },
            required: ['stepId'],
          },
        },
        {
          name: 'get_progress',
          description: 'Get complete onboarding progress for an employee',
          inputSchema: {
            type: 'object',
            properties: {
              email: {
                type: 'string',
                description: 'Employee email address (optional - will auto-detect if not provided)',
              },
            },
            required: [],
          },
        },
        {
          name: 'get_all_steps',
          description: 'Get all available onboarding steps',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
        {
          name: 'get_resources',
          description: 'Get onboarding resources (wiki links, videos, etc.)',
          inputSchema: {
            type: 'object',
            properties: {
              resourceName: {
                type: 'string',
                description: 'Specific resource name to retrieve (optional)',
              },
            },
            required: [],
          },
        },
        {
          name: 'request_saw_device',
          description: 'Submit a SAW (Secure Access Workstation) device request',
          inputSchema: {
            type: 'object',
            properties: {
              deviceType: {
                type: 'string',
                description: 'Type of SAW device requested',
              },
              managerEmail: {
                type: 'string',
                description: 'Manager email for approval',
              },
              email: {
                type: 'string',
                description: 'Employee email address (optional - will auto-detect if not provided)',
              },
            },
            required: ['deviceType', 'managerEmail'],
          },
        },
        {
          name: 'get_employee_list',
          description: 'Get list of all employees for onboarding buddies',
          inputSchema: {
            type: 'object',
            properties: {
              buddyEmail: {
                type: 'string',
                description: 'Filter by buddy email (optional)',
              },
            },
            required: [],
          },
        },
        {
          name: 'register_employee',
          description: 'Register a new employee when auto-detection fails',
          inputSchema: {
            type: 'object',
            properties: {
              email: {
                type: 'string',
                description: 'Employee email address',
              },
              name: {
                type: 'string',
                description: 'Employee full name',
              },
              buddyEmail: {
                type: 'string',
                description: 'Onboarding buddy email address (optional)',
              },
              department: {
                type: 'string',
                description: 'Employee department (optional)',
              },
            },
            required: ['email', 'name'],
          },
        },
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'start_onboarding':
            return await this.handleStartOnboarding(args as StartOnboardingArgs);
          
          case 'get_current_step':
            return await this.handleGetCurrentStep(args as { email?: string });
          
          case 'complete_step':
            return await this.handleCompleteStep(args as unknown as CompleteStepArgs);
          
          case 'get_progress':
            return await this.handleGetProgress(args as GetProgressArgs);
          
          case 'get_all_steps':
            return await this.handleGetAllSteps();
          
          case 'get_resources':
            return await this.handleGetResources(args as { resourceName?: string });
          
          case 'request_saw_device':
            return await this.handleRequestSAWDevice(args as any);
          
          case 'get_employee_list':
            return await this.handleGetEmployeeList(args as GetEmployeeListArgs);
          
          case 'register_employee':
            return await this.handleRegisterEmployee(args as StartOnboardingArgs);
          
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (error: any) {
        if (error.message === 'REGISTRATION_REQUIRED') {
          return {
            content: [
              {
                type: 'text',
                text: 'Employee registration required. Please use the register_employee tool first with your email and name.',
              },
            ],
          };
        }
        
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  private async handleStartOnboarding(args: StartOnboardingArgs) {
    try {
      let profile: EmployeeProfile;

      if (args.email) {
        // Use provided email
        profile = await EmployeeIdentifier.createNewProfile(args.email, args);
      } else {
        // Auto-detect employee
        profile = await EmployeeIdentifier.getEmployeeProfile();
      }

      const currentStep = await ConfigParser.getStep(profile.currentStep);
      
      return {
        content: [
          {
            type: 'text',
            text: `Welcome ${profile.name}! Your onboarding has been initialized.\n\n` +
                  `Current step: ${currentStep ? currentStep.title : 'Loading...'}\n` +
                  `Progress: ${profile.completedSteps.length} steps completed\n\n` +
                  `Your profile has been saved and you can continue your onboarding anytime by asking me about your next step.`,
          },
        ],
      };
    } catch (error: any) {
      throw error;
    }
  }

  private async handleGetCurrentStep(args: { email?: string }) {
    const profile = await EmployeeIdentifier.getEmployeeProfile(args.email);
    const currentStep = await ConfigParser.getStep(profile.currentStep);
    
    if (!currentStep) {
      return {
        content: [
          {
            type: 'text',
            text: 'Congratulations! You have completed all onboarding steps.',
          },
        ],
      };
    }

    const formattedStep = ConfigParser.formatStepForAI(currentStep);
    
    return {
      content: [
        {
          type: 'text',
          text: `**Current Step (${profile.currentStep}/${await this.getTotalSteps()}):**\n\n${formattedStep}`,
        },
      ],
    };
  }

  private async handleCompleteStep(args: CompleteStepArgs) {
    const profile = await EmployeeIdentifier.getEmployeeProfile(args.email);
    
    // Validate step completion
    if (profile.completedSteps.includes(args.stepId)) {
      return {
        content: [
          {
            type: 'text',
            text: `Step ${args.stepId} is already completed.`,
          },
        ],
      };
    }

    if (args.stepId !== profile.currentStep) {
      return {
        content: [
          {
            type: 'text',
            text: `You must complete step ${profile.currentStep} before moving to step ${args.stepId}.`,
          },
        ],
      };
    }

    // Mark step as completed
    profile.completedSteps.push(args.stepId);
    profile.stepData[args.stepId] = {
      completedAt: new Date().toISOString(),
      notes: args.notes,
      data: args.data,
    };

    // Advance to next step
    const allSteps = await ConfigParser.getAllSteps();
    const nextStep = allSteps.find(step => step.id > args.stepId);
    profile.currentStep = nextStep ? nextStep.id : args.stepId + 1;

    await EmployeeIdentifier.saveEmployeeProfile(profile);

    const completedStep = await ConfigParser.getStep(args.stepId);
    const upcomingStep = await ConfigParser.getStep(profile.currentStep);

    let message = `✅ Step ${args.stepId} completed: ${completedStep?.title || 'Unknown step'}\n\n`;
    
    if (upcomingStep) {
      message += `🎯 Next step: ${upcomingStep.title}\n`;
      message += `Progress: ${profile.completedSteps.length}/${allSteps.length} steps completed`;
    } else {
      message += `🎉 Congratulations! You have completed all onboarding steps!`;
    }

    return {
      content: [
        {
          type: 'text',
          text: message,
        },
      ],
    };
  }

  private async handleGetProgress(args: GetProgressArgs) {
    const profile = await EmployeeIdentifier.getEmployeeProfile(args.email);
    const allSteps = await ConfigParser.getAllSteps();
    
    let progress = `**Onboarding Progress for ${profile.name}**\n\n`;
    progress += `Email: ${profile.email}\n`;
    progress += `Start Date: ${new Date(profile.startDate).toLocaleDateString()}\n`;
    progress += `Current Step: ${profile.currentStep}\n`;
    progress += `Completed: ${profile.completedSteps.length}/${allSteps.length} steps\n\n`;

    progress += `**Step Details:**\n`;
    for (const step of allSteps) {
      const isCompleted = profile.completedSteps.includes(step.id);
      const isCurrent = step.id === profile.currentStep;
      const status = isCompleted ? '✅' : isCurrent ? '🔄' : '⏸️';
      
      progress += `${status} Step ${step.id}: ${step.title}`;
      
      if (isCompleted && profile.stepData[step.id]) {
        const completedAt = new Date(profile.stepData[step.id].completedAt).toLocaleDateString();
        progress += ` (completed ${completedAt})`;
      }
      
      progress += '\n';
    }

    return {
      content: [
        {
          type: 'text',
          text: progress,
        },
      ],
    };
  }

  private async handleGetAllSteps() {
    const steps = await ConfigParser.getAllSteps();
    
    let stepsText = '**All Onboarding Steps:**\n\n';
    
    for (const step of steps) {
      stepsText += `**Step ${step.id}: ${step.title}**\n`;
      stepsText += `${step.description}\n`;
      stepsText += `Type: ${step.type} | Required: ${step.required ? 'Yes' : 'No'}\n\n`;
    }

    return {
      content: [
        {
          type: 'text',
          text: stepsText,
        },
      ],
    };
  }

  private async handleGetResources(args: { resourceName?: string }) {
    if (args.resourceName) {
      const resource = await ConfigParser.getResource(args.resourceName);
      if (!resource) {
        return {
          content: [
            {
              type: 'text',
              text: `Resource '${args.resourceName}' not found.`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: resource,
          },
        ],
      };
    }

    // Return all available resources
    const config = await ConfigParser.loadConfiguration();
    const resourceNames = Object.keys(config.resources);
    
    let resourcesText = '**Available Resources:**\n\n';
    for (const name of resourceNames) {
      resourcesText += `- ${name}\n`;
    }
    
    resourcesText += '\nUse get_resources with a specific resourceName to view content.';

    return {
      content: [
        {
          type: 'text',
          text: resourcesText,
        },
      ],
    };
  }

  private async handleRequestSAWDevice(args: any) {
    const profile = await EmployeeIdentifier.getEmployeeProfile(args.email);
    
    // Simulate SAW device request
    const requestId = `SAW-${Date.now()}`;
    
    // Save SAW request info to profile
    if (!profile.stepData[2]) {
      profile.stepData[2] = {};
    }
    profile.stepData[2].sawRequestId = requestId;
    profile.stepData[2].deviceType = args.deviceType;
    profile.stepData[2].managerEmail = args.managerEmail;
    profile.stepData[2].requestedAt = new Date().toISOString();
    
    await EmployeeIdentifier.saveEmployeeProfile(profile);

    return {
      content: [
        {
          type: 'text',
          text: `SAW Device request submitted successfully!\n\n` +
                `Request ID: ${requestId}\n` +
                `Device Type: ${args.deviceType}\n` +
                `Manager Approval: ${args.managerEmail}\n\n` +
                `You will receive an email when your request is processed. ` +
                `This typically takes 2-3 business days.`,
        },
      ],
    };
  }

  private async handleGetEmployeeList(args: GetEmployeeListArgs) {
    const profiles = await EmployeeIdentifier.getAllProfiles();
    
    let filteredProfiles = profiles;
    if (args.buddyEmail) {
      filteredProfiles = profiles.filter(p => p.buddyEmail === args.buddyEmail);
    }

    if (filteredProfiles.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: 'No employees found.',
          },
        ],
      };
    }

    let employeeList = '**Employee Onboarding Status:**\n\n';
    
    for (const profile of filteredProfiles) {
      const allSteps = await ConfigParser.getAllSteps();
      const completionPercentage = Math.round((profile.completedSteps.length / allSteps.length) * 100);
      
      employeeList += `**${profile.name}** (${profile.email})\n`;
      employeeList += `Progress: ${profile.completedSteps.length}/${allSteps.length} steps (${completionPercentage}%)\n`;
      employeeList += `Current Step: ${profile.currentStep}\n`;
      employeeList += `Start Date: ${new Date(profile.startDate).toLocaleDateString()}\n\n`;
    }

    return {
      content: [
        {
          type: 'text',
          text: employeeList,
        },
      ],
    };
  }

  private async handleRegisterEmployee(args: StartOnboardingArgs) {
    if (!args.email || !args.name) {
      throw new Error('Email and name are required for registration');
    }

    const profile = await EmployeeIdentifier.createNewProfile(args.email, args);
    
    return {
      content: [
        {
          type: 'text',
          text: `Employee registered successfully!\n\n` +
                `Name: ${profile.name}\n` +
                `Email: ${profile.email}\n` +
                `Start Date: ${new Date(profile.startDate).toLocaleDateString()}\n\n` +
                `You can now use other onboarding tools. Ask me about your current step to begin!`,
        },
      ],
    };
  }

  private async getTotalSteps(): Promise<number> {
    const steps = await ConfigParser.getAllSteps();
    return steps.length;
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Employee Onboarding MCP server running on stdio');
  }
}

const server = new OnboardingMCPServer();
server.run().catch(console.error);
