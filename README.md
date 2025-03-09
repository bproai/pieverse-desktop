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

### 🐍 Python Sandbox
- Integrated Python environment with Monaco Editor (syntax highlighting and autocompletion).
- Preloaded libraries (pandas, numpy, etc.) and secure execution via Rust integration (PyO3).

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
- [Node.js](https://nodejs.org/) 18 or higher
- npm (bundled with Node.js)

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
├── src-tauri/ - Rust backend code
├── BP/ - Business presentation assets (SVGs, pitch page, PowerPoint outlines)
├── Business Plan/ - Strategic business assets
├── docs/ - Documentation (User Guide, Contributing Guidelines, etc.)
├── generate_changelog.py - Utility scripts including changelog generation
├── package.json - Node.js dependencies
└── ...
```

## 🏗️ Architecture
PieVerse Desktop is built using the Tauri framework, combining a robust Rust backend with a dynamic React frontend.

### Frontend:
Built with React and TypeScript, using Mantine UI and TailwindCSS, it offers a creative workspace and dynamic interface adjustments.

### Backend:
Powered by Rust with Tauri, it uses SQLite for local storage, supports MySQL/MongoDB, and exposes a RESTful API via Axum.

### AI Technology:
Multiple AI models (Rule-based, GPT-4o mini, GPT-4o Realtime, and GPT-4o Realtime Mini) adapt to your needs for natural, interactive experiences.

## 🌐 API Reference
The RESTful API supports endpoints for prompt management, Q&A data handling, and database operations. Refer to our API documentation for detailed information.

## 📂 Database Location

### Development Mode
The SQLite database is located at:
```bash
.local/share/pieverse/prompts.db
```

### Production Mode
The database is stored in the system's local data directory:
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
- **v0.1.0 (2025-03-01):**
  Initial release – Basic AI assistant avatar, SQLite integration, and prompt management.
- **v0.2.0 (2025-03-15):**
  Added MySQL/MongoDB support, Python sandbox, and enhanced trend analysis.
- **v0.3.0 (2025-04-01):**
  Integrated GPT-4o Realtime, improved avatar expressions, and expanded API functionality.

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