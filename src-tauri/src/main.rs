// src-tauri/src/main.rs
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Prevents additional console window on Windows in release
fn main() {
    pieverse_lib::run()
}