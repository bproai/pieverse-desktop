# PieVerse Desktop

<div align="center">
  <img src="./src/assets/logo.svg" alt="PieVerse Logo" width="120" />
  <h3>A Versatile Developer Toolkit & AI Assistant</h3>
  <p>Combining database management, AI assistance, and development tools in one powerful desktop application</p>
</div>

## ✨ Overview

PieVerse Desktop brings together essential development tools, database management interfaces, and an AI assistant in a modern Tauri (Rust + React) desktop application. The app features a friendly anime-style avatar assistant with speech recognition capabilities, support for multiple database types, a Python sandbox environment, trend analysis, and a comprehensive prompt management system.

## 🚀 Features

### 🤖 Interactive AI Assistant Avatar
- Floating, draggable anime-style avatar that provides AI assistance
- Multiple facial expression animations (happy, thoughtful, excited, neutral)
- Multiple AI engine options:
  - **Rule-based mode**: Simple, predefined responses for basic queries
  - **GPT-4o mini**: Uses Whisper for STT, GPT-4o mini for text generation, and system's native TTS 
  - **GPT-4o Realtime**: WebRTC streaming with voice-in/voice-out and Voice Activity Detection
  - **GPT-4o Realtime Mini**: Cost-effective version of the Realtime model with same voice capabilities
- Different UI workflows based on selected AI engine
- Record/playback capability for non-realtime modes

### 📝 AI Prompt Management
- Create, edit, delete AI prompts and instructions
- Categorize prompts (Writing & Analysis, Finance & Markets, Code & Development)
- Bulk import and export of prompts
- Toggle between SQLite and MySQL storage backends
- Activation/deactivation of individual prompts

### 📊 Trend Analysis & Signal Detection
- Google Trends data visualization and analysis
- Trend spike prediction and monitoring
- Signal breakdown with leading indicators
- Automated monitoring with customizable thresholds
- Export trend data to CSV format

### 🐍 Python Sandbox
- Integrated Python environment for quick scripting and testing
- Monaco-based code editor with syntax highlighting and autocompletion
- Execute Python code and view results directly in the app
- Pre-loaded libraries including pandas and numpy
- Reset environment functionality

### 🔄 Database Management
- MySQL connection and query execution
- MongoDB integration
- SQLite local database support
- Transfer data between MySQL and SQLite
- Intuitive SQL query interface with results display

### 🌐 API Settings
- Configure and manage a local API server
- Customize port settings
- Start/stop service controls
- RESTful API for prompt management 
- CORS support for cross-origin requests

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
│   ├── components/ - React components
│   │   ├── Avatar.tsx - AI assistant avatar
│   │   ├── BrandLogo.tsx - Application logo component
│   │   ├── APISettings/ - API server settings
│   │   │   ├── APISettingsPanel.tsx - API configuration UI
│   │   │   └── index.tsx - Exports
│   │   ├── MongoDB/ - MongoDB interface
│   │   │   ├── MongoDBPanel.tsx - MongoDB UI
│   │   │   └── index.ts - Exports
│   │   ├── MySQL/ - MySQL interface
│   │   │   ├── MySQLPanel.tsx - MySQL UI
│   │   │   ├── MySQLService.ts - MySQL service connector
│   │   │   ├── types.ts - Type definitions
│   │   │   └── index.ts - Exports
│   │   ├── Python/ - Python sandbox
│   │   │   └── PythonPanel.tsx - Code editor interface
│   │   ├── Signals/ - Trend analysis and monitoring
│   │   │   ├── SignalsPanel.tsx - Google Trends visualization
│   │   │   ├── DetectedSpikeCard.tsx - Trend spike UI card
│   │   │   └── index.ts - Exports
│   │   └── Prompts/ - AI prompt management
│   │       ├── PromptsManager.tsx - Prompt CRUD interface
│   │       └── index.ts - Exports
│   ├── services/ - Frontend services
│   │   ├── SQLitePromptService.ts - SQLite prompt operations
│   │   └── MySQLPromptService.ts - MySQL prompt operations
│   ├── assets/ - Static assets and resources
│   └── styles/ - CSS and style files
├── src-tauri/ - Rust backend code
│   ├── src/
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
│   │   ├── python_scripts/ - Python backend scripts
│   │   │   ├── trend_spike_predictor.py - Trend prediction
│   │   │   ├── google_trends.py - Google Trends API
│   │   │   ├── fetch_data.py - Data retrieval utilities
│   │   │   └── requirements.txt - Python dependencies
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

PieVerse Desktop is built using the [Tauri](https://tauri.app/) framework, which combines Rust for the backend and React for the frontend.

### Frontend
- React 19 with TypeScript
- Mantine UI components
- Monaco Editor for code editing
- TailwindCSS for styling
- Recharts for data visualization

### Backend
- Rust with Tauri for cross-platform desktop runtime
- SQLite for local data storage
- Python integration via PyO3
- MySQL and MongoDB connectors
- Axum for the REST API server

### AI Technology
The avatar assistant leverages multiple AI models with different interaction patterns:

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
- Google Trends integration for market data
- Prophet forecasting model for trend prediction
- Machine learning-based spike detection
- Real-time trend monitoring with customizable thresholds
- Signal breakdown and analysis

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

## 📂 Database Location (Development Mode)
During development, the SQLite database is created in the relative path: .local/share/pieverse/prompts.db

This folder is located relative to the directory from which you start the Tauri app (usually your project's root). On Unix-like systems, hidden directories (those beginning with a dot) might not be visible by default. Use commands like `ls -la` to list hidden files, or enable hidden files in your file explorer.

## 📄 License

[MIT License](LICENSE)

---

<div align="center">
  <p>Built with ❤️ using <a href="https://tauri.app/">Tauri</a> and <a href="https://react.dev/">React</a></p>
</div>