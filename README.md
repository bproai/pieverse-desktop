# PiEVerse Desktop

PiEVerse Desktop is a versatile developer toolkit that combines database management, AI assistance, and development tools in one powerful Tauri-based desktop application.

<img src="./src/assets/logo.svg" alt="PiEVerse Logo" width="120" />

## Overview

PiEVerse Desktop brings together essential development tools, database management interfaces, and an AI assistant in a modern Tauri (Rust + React) desktop application. The app features a friendly anime-style avatar assistant with speech recognition capabilities, support for multiple database types, a Python sandbox environment, and a comprehensive prompt management system.

## Table of Contents
- [Features](#features)
- [Installation](#installation)
- [Development](#development)
- [Architecture](#architecture)
- [API Reference](#api-reference)
- [License](#license)

## Features

### AI Prompt Management
- Create, edit, delete AI prompts and instructions
- Categorize prompts (Writing & Analysis, Finance & Markets, Code & Development)
- Bulk import and export of prompts
- Toggle between SQLite and MySQL storage backends
- Activation/deactivation of individual prompts

### Interactive AI Assistant Avatar
- Floating, draggable anime-style avatar that provides AI assistance
- Multiple facial expression animations (happy, thoughtful, excited, neutral)
- Multiple AI engine options:
  - Rule-based mode: Simple, predefined responses for basic queries
  - GPT-4o mini: Uses Whisper for STT, GPT-4o mini for text generation, and browser's TTS 
  - GPT-4o Realtime: WebRTC streaming with voice-in/voice-out and Voice Activity Detection
  - GPT-4o Realtime Mini: Cost-effective version of the Realtime model with same voice capabilities
- Different UI workflows based on selected AI engine
- Record/playback capability for non-realtime modes

### Python Sandbox
- Integrated Python environment for quick scripting and testing
- Monaco-based code editor with syntax highlighting and autocompletion
- Execute Python code and view results directly in the app
- Pre-loaded libraries including pandas and numpy
- Reset environment functionality

### API Settings
- Configure and manage a local API server
- Customize port settings
- Start/stop service controls
- RESTful API for prompt management 
- CORS support for cross-origin requests

### Database Management
- MySQL connection and query execution
- MongoDB integration
- SQLite local database support
- Transfer data between MySQL and SQLite
- Intuitive SQL query interface with results display

## Installation

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

## Development

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
│   ├── components/ - React components
│   │   ├── Avatar/ - AI assistant avatar
│   │   ├── APISettings/ - API server settings
│   │   ├── MongoDB/ - MongoDB interface
│   │   ├── MySQL/ - MySQL interface
│   │   ├── Python/ - Python sandbox
│   │   └── Prompts/ - AI prompt management
│   └── services/ - Frontend services
├── src-tauri/ - Rust backend code
│   ├── src/
│   │   ├── services/ - Backend services
│   │   │   ├── api_server.rs - HTTP API server
│   │   │   ├── mongodb.rs - MongoDB connector
│   │   │   ├── mysql.rs - MySQL connector
│   │   │   ├── python.rs - Python interpreter
│   │   │   ├── sqlite.rs - SQLite database
│   │   │   ├── sqlite_prompts.rs - Prompt management
│   │   │   └── whisper.rs - OpenAI API integration
│   │   ├── lib.rs - Main library
│   │   └── main.rs - Entry point
│   └── Cargo.toml - Rust dependencies
├── package.json - Node.js dependencies
└── vite.config.ts - Vite configuration
```

## Architecture

PiEVerse Desktop is built using the [Tauri](https://tauri.app/) framework, which combines Rust for the backend and React for the frontend.

### Frontend
- React 19 with TypeScript
- Mantine UI components
- Monaco Editor for code editing
- TailwindCSS for styling

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
   - Browser's built-in speech synthesis for mechanical text-to-speech
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

4. **OpenAI Whisper API Integration**
   - Advanced speech-to-text capabilities
   - Multiple audio format support
   - High accuracy transcription
   - Handles different accents and speaking styles
   - Requires OpenAI API key

## API Reference

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

## License

[MIT License](LICENSE)

---

Built with ❤️ using [Tauri](https://tauri.app/) and [React](https://react.dev/)