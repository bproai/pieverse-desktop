# PieVerse Desktop

<div align="center">
  <img src="./src/assets/logo.svg" alt="PieVerse Logo" width="120" />
  <h3>A Versatile AI Assistant & Creative Workspace</h3>
  <p>Empowering you with a dynamic, AI-powered personal assistant that enhances productivity, creativity, and collaboration in everyday life.</p>
</div>

## ✨ Overview

PieVerse Desktop is more than just a toolkit—it's your personal AI companion and creative partner. Built with cutting-edge AI technology, PieVerse adapts to your unique needs, whether you're in a business meeting, solving complex problems, or exploring creative pursuits. The application combines intelligent assistance, dynamic UI customization, and innovative creative tools to help you unlock new possibilities.

## 🚀 Features

### 🤖 AI Assistant Avatar
- A friendly, anime-style avatar that acts as your personal AI assistant.
- Advanced speech recognition and natural language processing for smooth, intuitive conversations.
- Multiple AI engine options for different interaction styles:
  - **Rule-based mode**: Simple, predefined responses for basic queries
  - **GPT-4o mini**: Uses Whisper for STT, GPT-4o mini for text generation, and system's native TTS 
  - **GPT-4o Realtime**: WebRTC streaming with voice-in/voice-out and Voice Activity Detection
  - **GPT-4o Realtime Mini**: Cost-effective version of the Realtime model with same voice capabilities
- Digital double functionality: the avatar can represent you in meetings, social settings, and more.
- Different UI workflows based on selected AI engine.
- Record/playback capability for non-realtime modes.

### 🎨 Creative Workspace
- An interactive environment for brainstorming, drafting, and refining creative projects.
- Collaborate with your AI assistant on novels, play scripts, drawings, music, or any artistic endeavor.
- Adaptive tools and inspiring prompts lower the barrier to hyper-creative expression.
- A platform that champions "meta creation" and "meta invention"—where your imagination is the only limit.

### 📝 AI Prompt Management
- Create, edit, and organize prompts tailored to your needs.
- Categorize prompts for diverse use cases such as creative writing, business analysis, and personal productivity.
- Bulk import and export of prompts.
- Toggle between SQLite and MySQL storage backends.
- Activation/deactivation of individual prompts.
- Seamless integration with cloud and local storage options.

### 📊 Trend Analysis & Signal Detection
- Real-time financial data visualization and analysis with Google Trends integration.
- Advanced algorithms for trend spike detection and forecasting.
- Customizable dashboards and interactive charts that keep you informed of market shifts.
- Signal breakdown with leading indicators.
- Automated monitoring with customizable thresholds.
- Export trend data to CSV format.

### 🐍 Python Sandbox
- Integrated Python environment for quick scripting and testing.
- Monaco-based code editor with syntax highlighting and autocompletion.
- Execute Python code and view results directly in the app.
- Pre-loaded libraries including pandas and numpy.
- Reset environment functionality.

### 🔄 Seamless Integration & Dynamic UI
- A highly adaptive, voice AI-assisted frontend that personalizes your interface in real time.
- Dynamic UI components that adjust based on your feedback and preferences.
- Robust API settings, ensuring secure connectivity with various data sources and services.

### 📂 Database & Data Management
- Integrated SQLite for local data storage along with support for MySQL and MongoDB.
- Intuitive data migration and management tools for a streamlined experience.
- Transfer data between MySQL and SQLite.
- Intuitive SQL query interface with results display.
- Designed to keep your data secure, accessible, and in a system-approved location.

### 🌐 API & External Connectivity
- A RESTful API that supports prompt management and external integrations.
- Configurable settings to tailor API functionality to your needs.
- Cross-origin resource sharing (CORS) support and secure connectivity options.
- Start/stop service controls.

## 🎥 Demo and Showcase

We are preparing live and recorded demos to showcase how PieVerse enables you to conduct business meetings, solve complex problems, and engage in inspiring, open-ended discussions. These demos will highlight the app's elegance, smooth performance, efficiency, and the playful dexterity in juggling multiple tasks—all powered by a dynamic, AI-driven interface.

## 📦 Installation

### Prerequisites
- [Rust](https://www.rust-lang.org/tools/install) 1.75 or higher
- [Node.js](https://nodejs.org/) 18 or higher
- npm (comes with Node.js)

### Build from Source
1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/pieverse-desktop.git
   cd pieverse-desktop
   ```

2. Install JavaScript dependencies:
   ```bash
   npm install
   ```

3. Build the application:
   ```bash
   npm run tauri build
   ```

The compiled application will be available in the `src-tauri/target/release` directory.

### Pre-built Binaries
Download the latest release for your platform from the [Releases page](https://github.com/yourusername/pieverse-desktop/releases).

## 💻 Development

### Setup Development Environment
1. Clone the repository
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
│   ├── App.tsx - Main application component
│   ├── components/ - React components (Avatar, Creative Workspace, etc.)
│   ├── services/ - Frontend services
│   ├── assets/ - Static assets and resources
│   └── styles/ - CSS and style files
├── src-tauri/ - Rust backend code
│   ├── src/ - Backend services and modules
│   │   ├── services/ - Backend services
│   │   │   ├── api_server.rs - HTTP API server
│   │   │   ├── mongodb.rs - MongoDB connector
│   │   │   ├── mysql.rs - MySQL connector
│   │   │   ├── python.rs - Python interpreter
│   │   │   ├── screenshot.rs - Screenshot functionality
│   │   │   ├── google_trends.rs - Google Trends integration
│   │   │   ├── trend_spike_service.rs - Trend analysis 
│   │   │   ├── sqlite.rs - SQLite database
│   │   │   ├── sqlite_prompts.rs - Prompt management
│   │   │   ├── whisper.rs - OpenAI API integration
│   │   │   ├── brand_sound.rs - Audio management
│   │   │   ├── avatar_window.rs - Floating avatar window
│   │   │   └── tray.rs - System tray implementation
│   │   ├── python_scripts/ - Python integration scripts
│   │   ├── lib.rs - Main library
│   │   └── main.rs - Entry point
│   ├── tauri.conf.json - Tauri configuration
│   └── Cargo.toml - Rust dependencies
├── package.json - Node.js dependencies
├── tailwind.config.js - TailwindCSS configuration
├── postcss.config.js - PostCSS configuration
├── tsconfig.json - TypeScript configuration 
└── vite.config.ts - Vite configuration
```

## 🏗️ Architecture

PieVerse Desktop is built using the [Tauri](https://tauri.app/) framework, combining a robust Rust backend with a dynamic React frontend.

### Frontend
- Built with React 19 and TypeScript.
- Uses Mantine UI components and TailwindCSS for modern, responsive design.
- Features an intuitive creative workspace and dynamic, AI-powered interface adjustments.
- Monaco Editor for code editing.
- Recharts for data visualization.

### Backend
- Powered by Rust with Tauri for cross-platform performance.
- Utilizes SQLite for local storage, with MySQL and MongoDB connectivity options.
- Exposes a RESTful API built on Axum, ensuring secure and efficient data management.
- Integrates Python for advanced data processing and trend analysis.

### AI Technology
The avatar assistant leverages multiple AI models to adapt to your needs:

1. **Rule-based Engine**
   - Simple, predefined patterns for common queries
   - Zero latency responses
   - No API key required
   - Works offline for basic interactions

2. **GPT-4o Mini Pipeline**
   - Multi-step workflow (record > preview > send > receive > TTS)
   - Uses OpenAI Whisper API for speech-to-text conversion
   - Processes text with GPT-4o mini model
   - Uses system's native speech synthesis for mechanical text-to-speech
   - Requires manual recording and submission by user
   - More control but less natural interaction flow
   - Requires OpenAI API key

3. **GPT-4o Realtime**
   - True voice-to-voice conversation with single click activation
   - WebRTC-based streaming for instant response
   - Voice Activity Detection (VAD) for natural turn-taking
   - Human-like voice responses
   - Much more natural conversation experience
   - Highest quality responses and best context retention
   - Requires OpenAI API key with higher usage costs

4. **GPT-4o Realtime Mini**
   - More affordable version of the Realtime model
   - Identical voice-to-voice WebRTC interface with VAD
   - Same natural conversation experience as full Realtime version
   - Good balance of quality and cost efficiency
   - Ideal for extended conversation sessions
   - Requires OpenAI API key with lower usage costs

### Data Analysis
- Google Trends integration for market data.
- Prophet forecasting model for trend prediction.
- Machine learning-based spike detection.
- Real-time trend monitoring with customizable thresholds.
- Signal breakdown and analysis.
- Interactive dashboards for market data visualization.

## 🌐 API Reference

### HTTP API
When enabled, the API server provides the following endpoints:

- `GET /api/status` - Check API server status
- `GET /api/health` - Health check with database connectivity
- `GET /api/prompts` - List all prompts
- `POST /api/prompts` - Create a new prompt
- `PUT /api/prompts/:id` - Update an existing prompt
- `DELETE /api/prompts/:id` - Delete a prompt

### Tauri Commands
The application exposes several Tauri commands for plugin and extension developers:

- **MongoDB**: `start_mongodb`, `stop_mongodb`, `list_mongodb_databases`, etc.
- **MySQL**: `mysql_connect`, `mysql_execute_query`, `mysql_test_connection`, etc.
- **Python**: `python_init`, `python_execute`, `python_reset`
- **SQLite**: `sqlite_init`, `sqlite_execute_query`
- **API Server**: `start_api_server`, `stop_api_server`
- **OpenAI**: `transcribe_audio`, `openai_4o_mini`
- **Google Trends**: `get_google_trends`, `get_related_queries`, `export_trends_data`
- **Trend Analysis**: `get_trend_predictions`, `predict_trend_spike`, `start_trend_spike_monitoring`
- **Screenshots**: `take_screenshot`, `take_screenshot_to_clipboard`

## 📂 Database Location

### Development Mode
During development, the SQLite database is created in the relative path: `.local/share/pieverse/prompts.db`

This folder is located relative to the directory from which you start the Tauri app (usually your project's root). On Unix-like systems, hidden directories (those beginning with a dot) might not be visible by default. Use commands like `ls -la` to list hidden files, or enable hidden files in your file explorer.

### Production Mode
In production, the SQLite database is stored in the system's local data directory. Typically, this is:

- **macOS:**  
  `~/Library/Application Support/pieverse/prompts.db`
- **Windows:**  
  `C:\Users\<username>\AppData\Local\pieverse\prompts.db`
- **Linux:**  
  `~/.local/share/pieverse/prompts.db`

This approach uses the operating system's designated local data directory (retrieved via functions like `dirs::data_local_dir()`), ensuring that your application's data is stored in a consistent, system-approved location.

## 📄 License

[MIT License](LICENSE)

---

<div align="center">
  <p>Built with ❤️ using <a href="https://tauri.app/">Tauri</a> and <a href="https://react.dev/">React</a></p>
</div>