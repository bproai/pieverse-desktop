# PieVerse Desktop

<div align="center">
  <img src="./src/assets/logo.svg" alt="PieVerse Logo" width="120" />
  <h3>A Versatile AI Assistant & Creative Workspace</h3>
  <p>Empowering you with a dynamic, AI-powered personal assistant that enhances productivity, creativity, and collaboration in everyday life.</p>
</div>

## 📋 Table of Contents
- [Overview](#overview)
- [Complete Digital Twin](#complete-digital-twin---our-killer-app)
- [Features](#features)
- [Demo and Showcase](#demo-and-showcase)
- [Quick Start Guide](#quick-start-guide)
- [Installation](#installation)
- [Development](#development)
- [Architecture](#architecture)
- [API Reference](#api-reference)
- [Database Location](#database-location)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [Changelog](#changelog)
- [License](#license)

## ✨ Overview
PieVerse Desktop is more than just a toolkit—it's your personal AI companion and creative partner. Built with cutting-edge AI technology, PieVerse adapts to your unique needs, whether you're in a business meeting, solving complex problems, or exploring creative pursuits. The application combines intelligent assistance, dynamic UI customization, and innovative creative tools to help you unlock new possibilities.

## 🌟 Complete Digital Twin - Our Killer App
Beyond a digital assistant, the Complete Digital Twin serves as:
- **🧠 Intellectual Growth Partner:** Proactively challenges your thinking, suggests learning paths, and tailors teaching methods to your cognitive style.
- **💖 Emotional Confidant:** Offers a safe space to process emotions and reflect on personal relationships.
- **⚖️ Moral Compass:** Clarifies ethical frameworks and provides balanced, value-aligned perspectives.
- **🌱 Personal Development Guide:** Supports growth through reflective practices, discussions, and adaptive feedback.
- **💪 Physical Wellness Steward:** Tracks health goals and motivates positive lifestyle adaptations.
- **🧿 Legacy Preservation:** Captures your stories and wisdom, preserving your intellectual and spiritual legacy for future generations.

*Future Embodiment:* Architected to eventually inhabit highly dexterous robotic systems, bringing these capabilities into the physical world.

## 🚀 Features

### 🤖 AI Assistant Avatar
- Friendly, anime-style avatar with advanced speech recognition and natural language processing.
- Multiple AI engine options:
  - **Rule-based mode:** Predefined responses for basic queries.
  - **GPT-4o mini:** Utilizes Whisper for STT, GPT-4o mini for text generation, and native TTS.
  - **GPT-4o Realtime:** Enables true voice-to-voice conversation via WebRTC.
  - **GPT-4o Realtime Mini:** Cost-effective, real-time conversational model.
- Digital double functionality for representation in meetings, social settings, and more.
- Support for different UI workflows and record/playback capabilities for non-realtime modes.

### 🎨 Creative Workspace
- Interactive environment for brainstorming, drafting, and refining creative projects.
- Adaptive tools and inspiring prompts to foster "meta creation" and "meta invention."

### 📝 AI Prompt Management
- Create, edit, and organize prompts across diverse use cases.
- Bulk import/export, version control, and advanced filtering.
- Seamless integration with both cloud and local storage options.

### 📊 Trend Analysis & Signal Detection
- Real-time financial data visualization with Google Trends integration.
- Advanced algorithms for spike detection, customizable dashboards, and machine learning–based forecasting.

### 📄 Document Renderer
- Visualize and edit HTML and Markdown content with built-in support for multiple formats.
- Features include:
  - **HTML Rendering:** View HTML with proper styling and layout.
  - **Markdown Support:** GitHub Flavored Markdown with syntax highlighting for code blocks.
  - **Custom Tag Support:** Special handling for `<userStyle>` tags for enhanced formatting.
  - **Multiple Content Types:** HTML, Markdown, plain text with newlines, and JSON.
  - **Dark/Light Mode:** Full theme support with optimized syntax highlighting.
  - **Syntax Detection:** Automatic content type detection for seamless workflow.
- Intelligent handling of newlines and data attributes.
- Preview and edit content from various sources with easy file loading capabilities.

### 🐍 Python Sandbox
- Integrated Python environment with Monaco Editor (syntax highlighting and autocompletion).
- Preloaded libraries (pandas, numpy, etc.) and secure execution via Rust integration (PyO3).

### 🧠 LLM Rules Management
- Configure and manage behavior rules for large language models
- Set up automated responses and custom interaction patterns
- Integrate with the AI assistant for consistent behavior across the application

### 📚 References Management
- Organize and access reference materials for creative projects and research
- Import external resources and create custom reference libraries
- Integrate references with the AI assistant for contextual awareness

### 🔄 Seamless Integration & Dynamic UI
- Adaptive, voice AI-assisted frontend that personalizes in real time.
- Robust API settings ensuring secure connectivity with external data sources and services.
- Cross-origin resource sharing (CORS) support.

### 📂 Database & Data Management
- Integrated SQLite for local storage with optional MySQL and MongoDB support.
- Intuitive data migration, a user-friendly SQL query interface, and secure data handling.

### 🌐 API & External Connectivity
- RESTful API for prompt management and external integrations.
- Customizable endpoints, CORS support, and health-check endpoints.

### 📸 Screenshot & Media Utilities
- Cross-platform screenshot and audio recording capabilities.
- Clipboard integration and organized file-based saving.

### 🔍 Chrome Extension Debugging
- Built-in Chrome DevTools Protocol integration for monitoring and debugging Chrome extensions
- Features include:
  - **Real-time console logs:** Monitor extension background scripts, service workers, and other Chrome targets
  - **Selective target monitoring:** Choose which Chrome targets to capture logs from
  - **Log filtering:** Search and filter console messages by content or log level
  - **Export capability:** Save logs to JSON for sharing or further analysis
  - **Responsive design:** Adapts to different screen sizes with intelligent badge display
  - **One-click copy:** Easily copy log entries to clipboard
- Helps troubleshoot extension behavior, track background processes, and debug service worker interactions

## Chrome Extension Debugging Setup

To use the Chrome Extension debugging feature:

1. Close all Chrome instances

2. Start Chrome with remote debugging enabled:
   ```bash
   # macOS
   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
   
   # Windows
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
   
   # Linux
   google-chrome --remote-debugging-port=9222
   ```

3. In a separate terminal window, start the Chrome Logger Bridge using one of these methods:
   ```bash
   # Option 1: Navigate to the bridge directory
   cd scripts/chrome-bridge
   npm install  # First time only
   npm start
   
   # Option 2: Run from the project root in DEBUG mode
   npm run bridge
   ```

4. Launch the PieVerse app in another terminal window:
   ```bash
   npm run tauri dev
   ```

5. Navigate to the Chrome DevTools Protocol Debugger in the app and click "Refresh Targets" to see available Chrome targets.

6. Select the extension or other Chrome target you want to monitor, then click "Connect" to start capturing logs.

The bridge creates a WebSocket server that facilitates communication between Chrome's DevTools Protocol and the application, allowing you to monitor console logs from Chrome extensions and other Chrome targets in real-time.

PieVerse's Chrome Debugger panel also provides built-in convenience features:
- **Auto-start capability:** The debugger can spawn terminal instances to automatically:
  - Launch Chrome in remote debugging mode
  - Start the bridge connection
- **One-click setup:** Simplifies the entire debugging process directly from within the application

## 🎥 Demo and Showcase
We are preparing live and recorded demos that highlight:
- Business meeting facilitation with the Digital Twin.
- Interactive problem solving and creative collaboration.
- A dynamic, AI-powered interface that exemplifies smooth performance and efficiency.

Watch our latest demo: *PieVerse Complete Digital Twin Demo*

## 🚀 Quick Start Guide
For users eager to jump in:
1. **Download:** Get the latest release for your platform.
2. **Install:** Run the installer and follow the on-screen instructions.
3. **Launch:** Open PieVerse Desktop.
4. **Setup:** Configure your OpenAI API key in *Settings > API Configuration*.
5. **Start Using:** Engage with your AI assistant or explore the creative workspace.
_For detailed instructions, please see the User Guide._

## 📦 Installation

### Prerequisites
- [Rust](https://www.rust-lang.org/tools/install) 1.75 or higher
  ```bash
  # Install Rust and Cargo (one-time setup)
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
  
  # Add Cargo to your path (add to your ~/.zshrc or ~/.bashrc for persistence)
  source "$HOME/.cargo/env"
  ```
- [Python](https://www.python.org/downloads/) 3.9 or higher (Anaconda/Miniconda also supported)
- [Node.js](https://nodejs.org/) 18 or higher
- npm (bundled with Node.js)

### Python Configuration
PieVerse Desktop requires Python for its sandbox feature. You'll need to configure the build system to find your Python installation:

1. Copy the config template: `cp .cargo/config.toml.template .cargo/config.toml`
2. Find your Python library path:
   ```bash
   # For Anaconda/Miniconda
   ls -la /path/to/anaconda/lib/libpython*
   
   # For system Python on macOS
   ls -la /Library/Frameworks/Python.framework/Versions/*/lib/libpython*
   
   # For Homebrew Python
   ls -la /opt/homebrew/opt/python@*/lib/libpython*
   
   # For Linux
   ls -la /usr/lib/python*/config-*/libpython*.so
   ```
3. Update `.cargo/config.toml` with your Python library path and version (example paths are provided in the template)

### Build from Source
1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/pieverse-desktop.git
   cd pieverse-desktop
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the application:
   ```bash
   npm run tauri build
   ```

The compiled application will be located in src-tauri/target/release.

### Pre-built Binaries
Download the latest release from the [Releases page](https://github.com/yourusername/pieverse-desktop/releases).

## 💻 Development

### Setup Development Environment
1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run tauri dev
   ```

### Project Structure
```
pieverse-desktop/
├── src/ - React frontend code
│   ├── components/ - UI components organized by feature
│   │   ├── APISettings/ - API configuration interface
│   │   ├── ChromeDebugger/ - Chrome DevTools Protocol integration
│   │   ├── FolderStructure/ - Project file explorer
│   │   ├── HtmlRenderer/ - HTML/Markdown rendering component
│   │   ├── JsSandbox/ - JavaScript execution environment
│   │   ├── LLMRules/ - LLM behavior configuration
│   │   ├── MongoDB/ - MongoDB connection and management
│   │   ├── MySQL/ - MySQL database integration
│   │   ├── Prompts/ - AI prompt management interface
│   │   ├── Python/ - Python execution environment
│   │   ├── References/ - Reference material management
│   │   └── Signals/ - Trend analysis and signal detection
│   ├── services/ - Frontend service layers
│   └── sql/ - SQL schemas and queries
├── src-tauri/ - Rust backend code
│   ├── capabilities/ - Tauri 2.0 security capabilities
│   ├── src/ - Rust source code
│   │   ├── services/ - Backend services
│   │   └── python_scripts/ - Python scripts for data analysis
├── scripts/
│   └── chrome-bridge/ - WebSocket bridge for Chrome DevTools Protocol
└── ...
```

## 🏗️ Architecture
PieVerse Desktop is built using the Tauri 2.0 framework, combining a robust Rust backend with a dynamic React frontend.

### Frontend:
Built with React and TypeScript, using Mantine UI and TailwindCSS, it offers a creative workspace and dynamic interface adjustments.

### Backend:
Powered by Rust with Tauri 2.0, it uses SQLite for local storage, supports MySQL/MongoDB, and exposes a RESTful API via Axum.

### AI Technology:
Multiple AI models (Rule-based, GPT-4o mini, GPT-4o Realtime, and GPT-4o Realtime Mini) adapt to your needs for natural, interactive experiences.

## 🌐 API Reference
The RESTful API supports endpoints for prompt management, Q&A data handling, and database operations. Refer to our API documentation for detailed information.

## 📂 Database Location

### Development Mode
The SQLite database is located at:
```bash
src-tauri/.local/share/pieverse/prompts.db
```

### Production Mode
The database is stored in the system's local data directory (using Tauri 2.0 path resolution):
- **macOS:** `~/Library/Application Support/pieverse/prompts.db`
- **Windows:** `C:\Users\<username>\AppData\Local\pieverse\prompts.db`
- **Linux:** `~/.local/share/pieverse/prompts.db`

## 🗺️ Roadmap
Our roadmap outlines our future plans:

- **Q2 2025:** Complete Digital Twin Beta Launch, enhanced avatar animations, and advanced prompt management.
- **Q3 2025:** Integration of additional AI models, expanded social capabilities for the Digital Twin, and improved trend analysis.
- **Q4 2025:** Robotics integration testing, enhanced legacy preservation, and multi-language support.

See our full [Roadmap](./docs/ROADMAP.md) for detailed milestones.

## 🤝 Contributing
We welcome community contributions! To contribute:

1. Fork the repository.
2. Create a feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. Make and test your changes:
   ```bash
   npm run test
   ```
4. Submit a pull request.

For detailed guidelines, refer to our [CONTRIBUTING.md](./docs/CONTRIBUTING.md).

## 📝 Changelog
- **v0.1.0:**
  Initial release – Basic AI assistant avatar, SQLite integration, and prompt management.
- **v0.2.0:**
  Added MySQL/MongoDB support, Python sandbox, and enhanced trend analysis.
- **v0.3.0:**
  Integrated GPT-4o Realtime, improved avatar expressions, and expanded API functionality.
- **v0.3.1:**
  Added HTML Renderer for visualizing and editing HTML content in multiple formats.
- **v0.3.2:**
  Enhanced Document Renderer with Markdown support, syntax highlighting, and <span class="user-style-normal">special tag handling</span>.

See the full [Changelog](./docs/CHANGELOG.md) for a complete history.

### Automatic Changelog Generation
PieVerse includes a Python script for automatically generating a comprehensive changelog from Git history:

```bash
python generate_changelog.py
```

This script compares the first commit to the latest HEAD, generating a detailed diff that tracks all changes throughout the project's history. The resulting changelog.txt file provides developers with a complete overview of code evolution, which is especially useful during development sprints and before releases.

For end users, we maintain a curated changelog that focuses on significant features and improvements.

## 📄 License
[MIT License](LICENSE)

<div align="center">
  <p>Built with ❤️ using <a href="https://tauri.app/">Tauri</a> and <a href="https://react.dev/">React</a></p>
</div>