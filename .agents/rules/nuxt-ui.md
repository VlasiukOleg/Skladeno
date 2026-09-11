# Nuxt UI Usage Guidelines

**Context:** The user has requested to strictly enforce the use of Nuxt UI components throughout the project.

## Rules
1. **Always prioritize Nuxt UI Components:** Whenever building or modifying UI elements, use Nuxt UI components (e.g., `UButton`, `UInput`, `UCard`, `UAlert`, `useToast()`) instead of standard HTML tags (`<button>`, `<input>`, `alert()`, etc.).
2. **Consult MCP Server:** Before implementing a Nuxt UI component, you MUST use the `nuxt-ui` MCP server tools (e.g., `get-component`, `search-components`) to read the official documentation and ensure you are using the correct props and slots for the current version.
3. **User Feedback:** Never use `alert()` for user-facing errors or messages. Always use the `useToast()` composable provided by Nuxt UI.
