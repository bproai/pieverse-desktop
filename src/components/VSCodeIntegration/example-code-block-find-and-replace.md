File: /Users/brian.pan/Documents/GitHub/pieverse-desktop/src-tauri/src/lib.rs

From this:
use services::webview_devtools::{
    open_webview_devtools, close_webview_devtools, is_webview_devtools_open,
    inject_console_logger, execute_javascript, is_console_logger_injected,
    receive_console_log, console_logger_ready, WebViewDevToolsState,
};

To this:
use services::webview_devtools::{
    open_webview_devtools, close_webview_devtools, is_webview_devtools_open,
    inject_console_logger, execute_javascript, execute_javascript_return, is_console_logger_injected,
    receive_console_log, console_logger_ready, WebViewDevToolsState,
};

From this:
           s3_get_file_count,
            // WebView DevTools command
            open_webview_devtools, close_webview_devtools, is_webview_devtools_open,
    inject_console_logger, execute_javascript, is_console_logger_injected,
    receive_console_log, console_logger_ready,apply_unix_patch,

        ])

To this:
            s3_get_file_count,
            // WebView DevTools command
            open_webview_devtools, close_webview_devtools, is_webview_devtools_open,
    inject_console_logger, execute_javascript, execute_javascript_return, is_console_logger_injected,
    receive_console_log, console_logger_ready,

        ])

-------------------

File: /Users/brian.pan/Documents/GitHub/pieverse-desktop/src-tauri/src/lib.rs, find the webview_devtools import and add the execute_javascript_return function:

From this:
use services::webview_devtools::{
    open_webview_devtools, close_webview_devtools, is_webview_devtools_open,
    inject_console_logger, execute_javascript, is_console_logger_injected,
    receive_console_log, console_logger_ready, WebViewDevToolsState,
};

To this:
use services::webview_devtools::{
    open_webview_devtools, close_webview_devtools, is_webview_devtools_open,
    inject_console_logger, execute_javascript, execute_javascript_return, is_console_logger_injected,
    receive_console_log, console_logger_ready, WebViewDevToolsState,
};
