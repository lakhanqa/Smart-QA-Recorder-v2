import { AgentContext } from "@eko-ai/eko";
import { faker } from "@faker-js/faker";

// Defined locally because of broken exports in @eko-ai/eko/types
export interface ToolResult {
    content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType?: string }>;
    isError?: boolean;
    extInfo?: Record<string, any>;
}

export interface Tool {
    readonly name: string;
    readonly description?: string;
    readonly parameters: any;
    execute(args: Record<string, any>, context: AgentContext): Promise<ToolResult>;
}

export class FakerTool implements Tool {
    readonly name = "faker_generate_data";
    readonly description = "Generates realistic fake data for testing purposes (names, emails, addresses, etc.) to use in form fields.";
    readonly parameters = {
        type: "object",
        properties: {
            category: {
                type: "string",
                enum: ["name", "email", "address", "company", "phone", "text"],
                description: "The category of fake data to generate"
            }
        },
        required: ["category"]
    } as any;

    async execute(args: Record<string, unknown>, agentContext: AgentContext): Promise<ToolResult> {
        let result = "";
        const category = args.category as string;

        switch (category) {
            case "name":
                result = faker.person.fullName();
                break;
            case "email":
                result = faker.internet.email();
                break;
            case "address":
                result = faker.location.streetAddress(true);
                break;
            case "company":
                result = faker.company.name();
                break;
            case "phone":
                result = faker.phone.number();
                break;
            case "text":
                result = faker.lorem.sentence();
                break;
            default:
                result = "Unknown category";
        }

        return {
            content: [{ type: "text", text: result }]
        };
    }
}
