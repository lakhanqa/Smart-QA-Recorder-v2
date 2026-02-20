# **Smart QA Recorder For Certa AI Hackathon**

A powerful Chromium extension for capturing browser interactions and generating AI-powered automation scripts, based on the Smart QA Recorder engine.

## Features

- 🔴 **Smart Interaction Recording**: Capture clicks, inputs, and navigations in real-time.
- 🤖 **AI Script Generation**: Convert captured steps into natural language automation prompts.
- 🔄 **Multi-LLM Support**: Works with Google Gemini, OpenAI, Claude, and OpenRouter.
- 🎯 **Browser Automation**: Automate complex web workflows using Eko AI.

## Supported AI Providers

- **Google Gemini** (Recommended) - Direct API access
- **OpenAI** - GPT models
- **Anthropic Claude** - Claude models
- **OpenRouter** - Access to multiple models

## Setup

### Prerequisites
- Node.js and pnpm installed
- Chrome browser
- API key from your chosen AI provider

### Installation

```shell
# Clone and install dependencies
git clone https://github.com/hiteshchouhan22/Smart-QA-Recorder.git
cd Smart-QA-Recorder
pnpm install

# Build the extension
pnpm run build

# For development with file watching
pnpm run dev

# Verbose build with detailed output
pnpm run build:verbose
```

### Load Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (top right toggle)
3. Click "Load unpacked"
4. Select the `dist` folder from the project directory
5. The Smart QA Recorder extension should now appear in your extensions

### Configuration

1. Click on the Smart QA Recorder extension icon
2. Go to "Options" to configure:
   - Choose your AI provider (Google Gemini recommended)
   - Enter your API key
   - Select the model
   - Save configuration

## Usage

1. Click the Smart QA Recorder extension icon to open the sidebar
2. Enter your natural language command in the prompt area
3. Click "Run" to execute the workflow
4. Monitor progress in the real-time logs

### Example Commands

- "Open a Website Record Clicks & Action, Then Generate Script for it in (JS,PY,Java)"
- "Navigate to Gmail and compose an email"
- "Fill the Workflow in Certa tenent with URL given to QA Bot"
- "Search Google for Certa and bookmark the result"

## API Keys Setup

### Google Gemini (Recommended)
1. Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Create a new API key
3. Use the key in extension options

### OpenAI
1. Visit [OpenAI API Keys](https://platform.openai.com/api-keys)
2. Create a new API key
3. Use the key in extension options

### Anthropic Claude
1. Visit [Anthropic Console](https://console.anthropic.com/)
2. Create an API key
3. Use the key in extension options

## Development

### Available Scripts

- `pnpm run build` - Production build
- `pnpm run dev` - Development build with file watching
- `pnpm run build:verbose` - Build with detailed progress
- `pnpm run start` - Alias for build

### Project Structure

```
src/
├── background/     # Background scripts for browser API access
├── content/        # Content scripts injected into web pages  
├── options/        # Extension options/settings UI
└── sidebar/        # Main extension UI sidebar

public/
├── manifest.json   # Extension manifest
├── options.html    # Options page HTML
└── sidebar.html    # Sidebar HTML
```

## Troubleshooting

### Common Issues

1. **API Errors**: Check your API key and provider configuration
2. **Rate Limiting**: Switch to a different provider or wait for limits to reset
3. **Extension Not Loading**: Ensure the `dist` folder is built and reload the extension

### Error Logs

The extension provides detailed error logging in the sidebar. Common error codes:
- **429**: Rate limited - wait or upgrade API plan
- **401**: Invalid API key
- **403**: Access denied to model
- **500**: Provider service issue

## License

MIT License - see LICENSE file for details

