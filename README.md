# PieVerse Prompt Pro

A powerful Chrome extension that enhances your AI interactions with ChatGPT and Claude through curated professional prompts.

![PieVerse Logo](icons/icon128.png)

## Features

- Pre-made professional prompts for common use cases
- Support for multiple AI platforms:
  - ChatGPT (chat.openai.com)
  - Claude.ai
- Dark-themed, user-friendly interface
- Categorized prompt library
- Quick keyboard access (Ctrl/Cmd + Shift + P)
- Seamless prompt insertion into AI chat interfaces
- Content extraction without clipboard access

## Installation

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension directory
5. The PieVerse icon should now appear in your Chrome toolbar

## Usage

1. Visit ChatGPT or Claude.ai in your browser
2. Click the PieVerse icon in your toolbar or use the keyboard shortcut (Ctrl/Cmd + Shift + P)
3. Select a prompt from the available categories:
   - Writing & Analysis
   - Finance & Markets
   - Code & Development
4. The selected prompt will be automatically inserted into the chat interface

## Current Prompt Categories

### Writing & Analysis
- Deep Analysis: Comprehensive text analysis focusing on themes and arguments
- Quick Summary: Concise summaries of key points and takeaways

### Finance & Markets
- Market Analysis: Detailed explanation of market movements and driving factors
- Financial Writing: Professional refinement of financial analysis and reports

### Code & Development
- Code Generation: Production-ready code with documentation
- Code Review: Expert feedback for code improvement

## Technical Details

### Project Structure
```
├── manifest.json          # Extension configuration
├── background.js          # Background service worker script
├── content.js             # Content script for AI platform interaction
├── popup.html             # Extension popup interface
├── popup.js               # Popup interaction logic
└── icons/                 # Extension icons
```

### Platform Support
The extension automatically detects and adapts to different AI platforms through domain detection:
- chat.openai.com
- chatgpt.com
- claude.ai

### Security & Privacy
- Uses Chrome's manifest V3
- Minimal permissions required:
  - storage
  - activeTab
  - scripting
- Content is extracted directly from page elements without clipboard access
- Host permissions limited to supported AI platforms

## Coming Soon

- Custom prompt creation and management
- Settings and preferences
- Additional prompt categories
- Platform-specific optimizations

## Development

### Prerequisites
- Chrome browser
- Basic knowledge of Chrome extension development

### Local Development
1. Make changes to the source files
2. Reload the extension in `chrome://extensions/`
3. Test changes on supported platforms

### Building for Production
1. Update version in `manifest.json`
2. Create a zip file of the extension directory
3. Submit to Chrome Web Store

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

Created by Reason ONE LLC. All rights reserved.

## Support

For issues, feature requests, or questions, please open an issue in the repository.