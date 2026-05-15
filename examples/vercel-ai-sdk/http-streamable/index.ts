import { createMCPClient } from '@ai-sdk/mcp';

const mcpClient = await createMCPClient({
    transport: {
        type: 'http',
        url: 'http://localhost:3000/mcp'
    },
});

const tools = await mcpClient.tools()

const list_supported_cities = tools['get_current_weather']

const result = await list_supported_cities.execute({
    "city": "Tokyo"
},{
    toolCallId: "1",
    messages: []
})

console.log(result)

await mcpClient.close();
