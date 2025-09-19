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
                description: 'ID of the step to mark as completed (optional - will use current step if not provided)',
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
                description: 'Optional additional data about step completion',
              },
            },
            required: [],
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
          // inputSchema: {
          //   type: 'object',
          //   properties: {},
          //   required: [],
          // },
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

  private async handleStartOnboarding(args: StartOnboardingArgs = {}) {
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
      const allSteps = await ConfigParser.getAllSteps();
      
      let welcomeMessage = `Welcome ${profile.name}! 🎉\n\n`;
      welcomeMessage += `You have ${allSteps.length} onboarding steps ahead. Let's start with Step ${profile.currentStep}:\n\n`;
      
      if (currentStep) {
        const formattedStep = ConfigParser.formatStepForAI(currentStep);
        welcomeMessage += `${formattedStep}\n\n`;
        welcomeMessage += `Type "done" when you complete this step to move to the next one.`;
      } else {
        welcomeMessage += `🎉 Congratulations! You have completed all onboarding steps!`;
      }
      
      return {
        content: [
          {
            type: 'text',
            text: welcomeMessage,
          },
        ],
      };
    } catch (error: any) {
      throw error;
    }
  }

  private async handleGetCurrentStep(args: { email?: string } = {}) {
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
    
    // Allow completion of current step if stepId not explicitly provided or matches current step
    const stepToComplete = args.stepId || profile.currentStep;
    
    // Validate step completion
    if (profile.completedSteps.includes(stepToComplete)) {
      return {
        content: [
          {
            type: 'text',
            text: `Step ${stepToComplete} is already completed.`,
          },
        ],
      };
    }

    if (stepToComplete !== profile.currentStep) {
      return {
        content: [
          {
            type: 'text',
            text: `You must complete step ${profile.currentStep} before moving to step ${stepToComplete}.`,
          },
        ],
      };
    }

    // Mark step as completed
    profile.completedSteps.push(stepToComplete);
    profile.stepData[stepToComplete] = {
      completedAt: new Date().toISOString(),
      notes: args.notes,
      data: args.data,
    };

    // Advance to next step
    const allSteps = await ConfigParser.getAllSteps();
    const nextStep = allSteps.find(step => step.id > stepToComplete);
    profile.currentStep = nextStep ? nextStep.id : stepToComplete + 1;

    await EmployeeIdentifier.saveEmployeeProfile(profile);

    const completedStep = await ConfigParser.getStep(stepToComplete);
    const upcomingStep = await ConfigParser.getStep(profile.currentStep);

    let message = `✅ Step ${stepToComplete} completed: ${completedStep?.title || 'Unknown step'}\n\n`;
    
    if (upcomingStep) {
      message += `🎯 Next step (${profile.currentStep}/${allSteps.length}): ${upcomingStep.title}\n\n`;
      const formattedStep = ConfigParser.formatStepForAI(upcomingStep);
      message += `${formattedStep}\n\n`;
      message += `Type "done" when you complete this step to move to the next one.`;
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

  private async handleGetProgress(args: GetProgressArgs = {}) {
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


  private async handleRegisterEmployee(args: StartOnboardingArgs = {}) {
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
