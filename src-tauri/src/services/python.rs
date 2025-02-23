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
    interpreter: Arc<Mutex<Option<Py<PyAny>>>>,
}

impl PythonService {
    pub fn new() -> Self {
        Self {
            interpreter: Arc::new(Mutex::new(None)),
        }
    }

    pub async fn init(&self) -> Result<(), PythonError> {
        let interpreter = self.interpreter.clone();
        
        tokio::task::spawn_blocking(move || {
            Python::with_gil(|py| {
                let locals = PyDict::new(py);
                let builtins = py.import("builtins")
                    .map_err(|e| PythonError::InitError(e.to_string()))?;
                
                locals.set_item("__builtins__", &builtins)
                    .map_err(|e| PythonError::InitError(e.to_string()))?;

                let globals = PyDict::new(py);
                globals.set_item("__builtins__", &builtins)
                    .map_err(|e| PythonError::InitError(e.to_string()))?;

                // Convert globals to Py<PyAny> (using deprecated into_py as desired)
                let globals_ref = globals.into_py(py);
                
                // Lock the mutex (this cannot error, so no map_err is needed)
                let mut interpreter_guard = futures::executor::block_on(interpreter.lock());
                *interpreter_guard = Some(globals_ref);

                Ok(())
            })
        }).await.map_err(|e| PythonError::InitError(e.to_string()))?
    }

    pub async fn execute(&self, code: &str) -> Result<ExecutionResult, PythonError> {
        let interpreter = self.interpreter.clone();
        let code = code.to_string();
        
        tokio::task::spawn_blocking(move || {
            Python::with_gil(|py| {
                let interpreter_guard = futures::executor::block_on(interpreter.lock());
                
                let env_obj = interpreter_guard.as_ref()
                    .ok_or_else(|| PythonError::PythonError("Interpreter not initialized".to_string()))?
                    .clone_ref(py);
    
                let globals = env_obj.downcast_bound::<PyDict>(py)
                    .map_err(|e| PythonError::PythonError(e.to_string()))?;
    
                // --- Minimal Change: Redirect stdout using attribute methods ---
                let io = py.import("io")
                    .map_err(|e| PythonError::PythonError(e.to_string()))?;
                let stringio = io.getattr("StringIO")
                    .map_err(|e| PythonError::PythonError(e.to_string()))?;
                let stdout_obj = stringio.call0()
                    .map_err(|e| PythonError::PythonError(e.to_string()))?;
                let stdout_clone = stdout_obj.clone();
                let sys = py.import("sys")
                    .map_err(|e| PythonError::PythonError(e.to_string()))?;
                let original_stdout = sys.getattr("stdout")
                    .map_err(|e| PythonError::PythonError(e.to_string()))?;
                sys.setattr("stdout", stdout_obj)
                    .map_err(|e| PythonError::PythonError(e.to_string()))?;
                // --- End Minimal Change ---
    
                let code_c = CString::new(code)
                    .map_err(|e| PythonError::PythonError(e.to_string()))?;
                
                let result = py.eval(code_c.as_c_str(), Some(globals), None)
                    .map_err(|e| PythonError::PythonError(e.to_string()))?;
                
                let captured: String = stdout_clone
                    .call_method0("getvalue")
                    .map_err(|e| PythonError::PythonError(e.to_string()))?
                    .extract()
                    .unwrap_or_default();
                
                // Restore original stdout using setattr.
                sys.setattr("stdout", original_stdout)
                    .map_err(|e| PythonError::PythonError(e.to_string()))?;
                
                let eval_output = result.to_string();
                let output = if captured.trim().is_empty() {
                    eval_output
                } else {
                    captured
                };
                
                Ok(ExecutionResult {
                    output,
                    error: None,
                    plots: None,
                })
            })
        }).await.map_err(|e| PythonError::PythonError(e.to_string()))?
    }
    
    

    pub async fn reset(&self) -> Result<(), PythonError> {
        let mut interpreter = self.interpreter.lock().await;
        *interpreter = None;
        drop(interpreter);
        self.init().await
    }
}

#[tauri::command]
pub async fn python_init(state: tauri::State<'_, PythonService>) -> Result<(), String> {
    state.init().await.map_err(|e| e.to_string())
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
