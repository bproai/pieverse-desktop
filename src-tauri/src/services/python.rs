// src-tauri/src/services/python.rs
use pyo3::prelude::*;
use pyo3::types::PyDict;
use std::sync::Arc;
use tokio::sync::Mutex;
use serde::Serialize;
use std::ffi::CString;

#[derive(Debug, thiserror::Error)]
pub enum PythonError {
    #[error("Python error: {0}")]
    PythonError(String),
    #[error("Initialization error: {0}")]
    InitError(String),
}

#[derive(Debug, Serialize)]
pub struct ExecutionResult {
    pub output: String,
    pub error: Option<String>,
    pub plots: Option<Vec<String>>,
}

pub struct PythonService {
    interpreter: Arc<Mutex<Option<PyObject>>>,
}

impl PythonService {
    pub fn new() -> Self {
        Self {
            interpreter: Arc::new(Mutex::new(None)),
        }
    }

    pub fn init(&self) -> Result<(), PythonError> {
        Python::with_gil(|py| {
            let locals = PyDict::new(py);
            let builtins = py.import("builtins")
                .map_err(|e| PythonError::InitError(e.to_string()))?;
            
            locals.set_item("__builtins__", &builtins)
                .map_err(|e| PythonError::InitError(e.to_string()))?;

            let globals = PyDict::new(py);
            globals.set_item("__builtins__", &builtins)
                .map_err(|e| PythonError::InitError(e.to_string()))?;

            // Convert PyDict to PyObject
            let globals_ref = globals.into_py(py);
            
            let mut interpreter = self.interpreter.blocking_lock();
            *interpreter = Some(globals_ref);

            Ok(())
        })
    }

    pub async fn execute(&self, code: &str) -> Result<ExecutionResult, PythonError> {
        Python::with_gil(|py| {
            let interpreter_guard = self.interpreter.blocking_lock();
            
            let globals = interpreter_guard.as_ref()
                .ok_or_else(|| PythonError::PythonError("Interpreter not initialized".to_string()))?
                .clone_ref(py);

            let globals = globals.downcast_bound(py)
                .map_err(|e| PythonError::PythonError(e.to_string()))?;

            let code_c = CString::new(code)
                .map_err(|e| PythonError::PythonError(e.to_string()))?;

            let result = py.eval(code_c.as_c_str(), Some(globals), None)
                .map_err(|e| PythonError::PythonError(e.to_string()))?;

            let output = result.to_string();
            
            Ok(ExecutionResult {
                output,
                error: None,
                plots: None,
            })
        })
    }

    pub async fn reset(&self) -> Result<(), PythonError> {
        let mut interpreter = self.interpreter.lock().await;
        *interpreter = None;
        self.init()
    }
}

#[tauri::command]
pub async fn python_init(state: tauri::State<'_, PythonService>) -> Result<(), String> {
    state.init().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn python_execute(
    state: tauri::State<'_, PythonService>,
    code: String,
) -> Result<ExecutionResult, String> {
    state.execute(&code).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn python_reset(state: tauri::State<'_, PythonService>) -> Result<(), String> {
    state.reset().await.map_err(|e| e.to_string())
}