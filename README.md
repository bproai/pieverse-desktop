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

### Interactive AI Assistant Avatar
- Floating, draggable anime-style avatar that provides AI assistance
- Voice recognition and text-to-speech capabilities using the OpenAI Whisper API
- Multiple facial expression animations (happy, thoughtful, excited, neutral)
- Integration with OpenAI models (including GPT-4o mini and GPT-4o realtime)
- Support for both rule-based and AI-powered interactions
- WebRTC-based real-time speech interface

### Database Management
- MySQL connection and query execution
- MongoDB integration
- SQLite local database support
- Transfer data between MySQL and SQLite
- Intuitive SQL query interface with results display

### AI Prompt Management
- Create, edit, delete AI prompts and instructions
- Categorize prompts (Writing & Analysis, Finance & Markets, Code & Development)
- Bulk import and export of prompts
- Toggle between SQLite and MySQL storage backends
- Activation/deactivation of individual prompts

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

## Installation

### Prerequisites
- [Rust](https://www.rust-lang.org/tools/install) 1.75 or higher
- [Node.js](https://nodejs.org/) 18 or higher
- [pnpm](https://pnpm.io/installation) or npm

### Build from Source
1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/pieverse-desktop.git
   cd pieverse-desktop
   ```

2. Install JavaScript dependencies:
   ```bash
   pnpm install
   ```

3. Build the application:
   ```bash
   pnpm tauri build
   ```

The compiled application will be available in the `src-tauri/target/release` directory.

### Pre-built Binaries
Download the latest release for your platform from the [Releases page](https://github.com/yourusername/pieverse-desktop/releases).

## Development

### Setup Development Environment
1. Clone the repository
2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Start the development server:
   ```bash
   pnpm tauri dev
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

### Key Components
- **Avatar System**: A draggable anime-style assistant that uses the OpenAI Whisper API for speech-to-text and provides both rule-based and AI-generated responses.
- **Database Connectors**: Native Rust implementations for connecting to MySQL, MongoDB, and SQLite databases.
- **Prompt Management**: A system for creating, categorizing, and storing AI prompts that can be used with various AI models.
- **Python Sandbox**: An embedded Python interpreter for running code directly within the application.
- **API Server**: A RESTful API server for accessing PiEVerse functionality from other applications.

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