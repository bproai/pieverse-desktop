// background.js

// Caches for storing Q&A data until it can be uploaded
let questionCache = [];
let answerCache = [];
let uploadInProgress = false;
const UPLOAD_INTERVAL = 30000; // Upload every 30 seconds
const MAX_CACHE_SIZE = 100;
const AUTH_TOKEN = "K9FnT7X3pL2QzA8mB6vD1yG5sH4jR0cE";

let wsConnection = null;
let wsReconnectTimer = null;
const WS_RECONNECT_INTERVAL = 5000; // Reconnect every 5 seconds if connection fails
const WS_DEFAULT_PORT = 3031; // Default WebSocket port
let pendingTabRegistrations = [];

let registeredTabs = {};

const tabInfoMap = new Map();

// Load cached data from storage on startup
function initializeState() {
  chrome.storage.local.get(['questionCache', 'answerCache'], function(result) {
    if (result.questionCache) {
      questionCache = result.questionCache;
      console.log(`Loaded ${questionCache.length} cached questions`);
    }
    
    if (result.answerCache) {
      answerCache = result.answerCache;
      console.log(`Loaded ${answerCache.length} cached answers`);
    }
  });
}

// Initialize the extension
initializeState();

// Store question data in cache
function storeQuestionData(data) {
  console.log("Storing question data:", data);
  
  // Make sure question cache is initialized
  if (!Array.isArray(questionCache)) {
    questionCache = [];
  }
  
  // Add to cache
  questionCache.push(data);
  
  // Limit cache size
  if (questionCache.length > MAX_CACHE_SIZE) {
    questionCache.shift(); // Remove oldest item
  }
  
  // Save to local storage as backup
  chrome.storage.local.set({ 'questionCache': questionCache });
  
  // Schedule upload
  scheduleUpload();

  // Also send the question via WebSocket for real-time notification
  sendWebSocketMessage({
    type: 'userQuestion',
    content: data.question,
    messageId: data.id,
    timestamp: data.timestamp,
    platform: data.platform
  });
}

// Store answer data in cache
function storeAnswerData(data) {
  console.log("Storing answer data:", data);
  
  // Make sure answer cache is initialized
  if (!Array.isArray(answerCache)) {
    answerCache = [];
  }
  
  // Add to cache
  answerCache.push(data);
  
  // Limit cache size
  if (answerCache.length > MAX_CACHE_SIZE) {
    answerCache.shift(); // Remove oldest item
  }
  
  // Save to local storage as backup
  chrome.storage.local.set({ 'answerCache': answerCache });
  
  // Update question's answered status
  const questionIndex = questionCache.findIndex(q => q.id === data.question_id);
  if (questionIndex !== -1) {
    questionCache[questionIndex].answered = true;
    chrome.storage.local.set({ 'questionCache': questionCache });
  }
  
  // Since we now have a complete question-answer pair, trigger immediate upload
  // instead of just scheduling it
  uploadCachedData(true);
}

// Schedule data upload
let uploadTimeout = null;
function scheduleUpload() {
  // Clear any existing timeout
  if (uploadTimeout) {
    clearTimeout(uploadTimeout);
  }
  
  // Set new timeout
  uploadTimeout = setTimeout(() => {
    uploadCachedData();
  }, 5000); // Wait 5 seconds after last change before uploading
}

// Upload cached data to API
async function uploadCachedData() {
  console.log("Attempting to upload cached Q&A data");
  
  // If no data to upload, skip
  if (questionCache.length === 0 && answerCache.length === 0) {
    console.log("No data to upload");
    return;
  }
  
  // If upload already in progress, skip
  if (uploadInProgress) {
    console.log("Upload already in progress, skipping");
    return;
  }
  
  uploadInProgress = true;
  
  try {
    // Get API URL from storage
    const apiUrl = await new Promise(resolve => {
      chrome.storage.sync.get(['apiUrl'], function(result) {
        resolve(result.apiUrl || 'http://localhost:3030');
      });
    });
    
    // Format questions for API
    const questions = questionCache.map(q => ({
      id: q.id,
      platform: q.platform,
      question: q.question,
      timestamp: q.timestamp,
      answered: q.answered
    }));
    
    // Format answers for API
    const answers = answerCache.map(a => ({
      id: a.id,
      question_id: a.question_id,
      message_id: a.message_id,
      platform: a.platform,
      answer: a.answer,
      model: a.model,
      timestamp: a.timestamp,
      turn_number: a.turn_number,
      metadata: a.metadata,
      url: a.url
    }));
    
    // CHANGE 3: Filter out potentially problematic data
    // Filter out questions with empty or null required fields
    const validQuestions = questions.filter(q => 
      q.id && q.platform && q.question && q.timestamp
    );
    
    // Filter out answers with empty or null required fields
    const validAnswers = answers.filter(a => 
      a.id && a.question_id && a.platform && a.answer && a.timestamp
    );

    console.log(`Uploading ${validQuestions.length} questions and ${validAnswers.length} answers to ${apiUrl}/api/qa`);
    console.log(`Filtered out ${questions.length - validQuestions.length} invalid questions and ${answers.length - validAnswers.length} invalid answers`);
    
    // Send to API
    const response = await fetch(`${apiUrl}/api/qa`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ questions: validQuestions, answers: validAnswers })
    });
    
    // CHANGE 2: Add more detailed error handling
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`API error response: ${errorText}`);
      throw new Error(`API returned status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.status === 'success') {
      console.log("Q&A data uploaded successfully:", data.message);
      
      // Clear caches
      questionCache = [];
      answerCache = [];
      
      // Update local storage
      chrome.storage.local.set({
        'questionCache': questionCache,
        'answerCache': answerCache
      });
    } else {
      console.error("API error:", data.message || "Unknown error");
    }
  } catch (error) {
    console.error("Error uploading Q&A data:", error);
    // We'll keep the data in cache and try again later
  } finally {
    uploadInProgress = false;
  }
}

// Set up periodic upload attempt
setInterval(uploadCachedData, UPLOAD_INTERVAL);

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Update last active timestamp for the tab
  if (sender && sender.tab && sender.tab.id && registeredTabs[sender.tab.id]) {
    registeredTabs[sender.tab.id].lastActive = Date.now();
  }
    
  if (request.action === "clickSubmitButton") {
    // Get the tab ID from the sender
    const tabId = sender.tab.id;
    
    console.log("Received clickSubmitButton request for platform:", request.platform);
    
    // Execute a script in the tab to click the submit button
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      function: clickSubmitButton,
      args: [request.platform]
    })
    .then(results => {
      console.log("Button click script executed:", results);
      sendResponse({ success: true });
    })
    .catch(error => {
      console.error("Error executing button click script:", error);
      sendResponse({ success: false, error: error.message });
    });
    
    // Keep the message channel open for async response
    return true;
  }
  
  // Handle storing question data
  if (request.action === "storeQuestionData") {
    storeQuestionData(request.data);
    
    // Add debug logging here
    console.log("After storing question, current caches:", {
      questions: questionCache.length,
      answers: answerCache.length
    });
    chrome.storage.local.get(['questionCache', 'answerCache'], result => {
      console.log("Storage caches after storing question:", {
        questions: result.questionCache?.length || 0,
        answers: result.answerCache?.length || 0
      });
    });
    
    sendResponse({ success: true });
    return true;
  }

  // Handle storing answer data
  if (request.action === "storeAnswerData") {
    storeAnswerData(request.data);

    // NEW CODE: Also send the answer via WebSocket
    try {
      const answerContent = JSON.parse(request.data.answer);
      sendWebSocketMessage({
        type: 'aiAnswer',
        content: answerContent,
        messageId: request.data.id,
        questionId: request.data.question_id,
        timestamp: request.data.timestamp,
        platform: request.data.platform,
        model: request.data.model
      });
    } catch (error) {
      console.error("Error sending answer via WebSocket:", error);
    }
    
    // Add debug logging here
    console.log("After storing answer, current caches:", {
      questions: questionCache.length,
      answers: answerCache.length
    });
    chrome.storage.local.get(['questionCache', 'answerCache'], result => {
      console.log("Storage caches after storing answer:", {
        questions: result.questionCache?.length || 0,
        answers: result.answerCache?.length || 0
      });
    });
    
    sendResponse({ success: true });
    return true;
  }

  // Handle reconnecting WebSocket with new URL
  if (request.action === "reconnectWebSocket") {
    console.log("Reconnecting WebSocket with new URL:", request.wsUrl);
    connectToWebSocket(request.wsUrl);
    sendResponse({ success: true });
    return true;
  }

  console.log("Current caches:", {
    questions: questionCache.length,
    answers: answerCache.length
  });
  chrome.storage.local.get(['questionCache', 'answerCache'], result => {
    console.log("Storage caches:", {
      questions: result.questionCache?.length || 0,
      answers: result.answerCache?.length || 0
    });
  });
  
  // Handle testing API connection
  if (request.action === "testApiConnection") {
    testApiConnection()
      .then(result => sendResponse(result))
      .catch(error => {
        console.error("Error testing API connection:", error);
        sendResponse({ success: false, error: error.message });
      });
    
    return true; // Keep the message channel open for async response
  }

  // Handle sending WebSocket messages
  if (request.action === "sendWebSocketMessage") {
    console.log("[DEBUG] Background script received WebSocket message request:", {
      type: request.data.type,
      messageId: request.data.messageId,
      contentLength: request.data.content ? request.data.content.length : 0,
      timestamp: request.data.timestamp
    });
    
    // Check WebSocket status before attempting to send
    if (!wsConnection) {
      console.error("[DEBUG] WebSocket connection is null");
      sendResponse({ success: false, error: "WebSocket connection is null" });
      return true;
    }
    
    console.log("[DEBUG] WebSocket readyState:", wsConnection.readyState);
    console.log("[DEBUG] WebSocket connection URL:", wsConnection.url);
    
    if (wsConnection.readyState === WebSocket.OPEN) {
      try {
        const messageString = JSON.stringify(request.data);
        console.log("[DEBUG] Sending to WebSocket, message length:", messageString.length);
        wsConnection.send(messageString);
        console.log("[DEBUG] Message sent successfully to WebSocket");
        sendResponse({ success: true });
      } catch (error) {
        console.error("[DEBUG] Error sending message to WebSocket:", error);
        sendResponse({ success: false, error: error.message });
      }
    } else {
      console.error("[DEBUG] WebSocket not connected, readyState:", wsConnection.readyState);
      sendResponse({ success: false, error: "WebSocket not connected" });
    }
    return true;
  }

  if (request.action === "extractContent") {
    // Get the tab ID from the sender
    const tabId = sender.tab.id;
    
    console.log("Received content extraction request");
    
    // Execute a script in the tab to click the copy button
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      function: extractContentDirectly
    })
    .then(results => {
      console.log("ExtractContent script executed:", results);
      
      if (results && results[0] && results[0].result && results[0].result.success) {
        // If copy was successful and we got the content directly
        const extractedContent = results[0].result.content;
        const messageId = results[0].result.messageId;
        
        // Send the content via WebSocket
        if (extractedContent) {
          sendWebSocketMessage({
            type: 'aiContent',
            content: extractedContent,
            messageId: messageId,
            timestamp: new Date().toISOString(),
            platform: request.platform || 'unknown'
          });
          
          sendResponse({ 
            success: true, 
            contentExtracted: true,
            extractedContent: extractedContent,
            contentLength: extractedContent.length
          });
        } else {
          sendResponse({ success: true, contentExtracted: false });
        }
      } else {
        sendResponse({ 
          success: false, 
          error: results && results[0] && results[0].result ? results[0].result.error : "Unknown error" 
        });
      }
    })
    .catch(error => {
      console.error("Error executing copy button click script:", error);
      sendResponse({ success: false, error: error.message });
    });
    
    // Keep the message channel open for async response
    return true;
  }

  if (request.action === "registerTab") {
    const tabId = sender.tab.id;
    const tabInfo = {
      url: sender.tab.url || "unknown",
      platform: request.platform,
      lastActive: Date.now(),
      title: sender.tab.title || null,  // Include tab title
      favicon: request.tabInfo ? request.tabInfo.favicon : null
    };
    
    console.log(`Tab ${tabId} registered with platform: ${request.platform} and title: ${tabInfo.title}`);
    registeredTabs[tabId] = tabInfo;
    
    // If WebSocket is connected, send tab registration
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
      console.log(`Sending tab registration for ${tabId} to WebSocket`);
      sendWebSocketMessage({
        type: 'register_tab',
        tabId: tabId.toString(),
        platform: request.platform,
        url: sender.tab.url || "unknown",
        title: sender.tab.title || null  // Send title information
      });
    } else {
      console.log(`WebSocket not connected or not ready, can't register tab ${tabId}`);
      console.log(`WebSocket status: ${wsConnection ? wsConnection.readyState : "null"}`);
      // Store for later registration when WebSocket connects
      if (!pendingTabRegistrations) {
        pendingTabRegistrations = [];
      }
      pendingTabRegistrations.push({
        tabId: tabId.toString(),
        platform: request.platform,
        url: sender.tab.url || "unknown",
        title: sender.tab.title || null  // Include title in pending registrations
      });
    }
    
    // Send confirmation back to the content script
    sendResponse({ success: true, tabId: tabId });
    return true;
  }

  // Handle tab unregistration (optional but good practice)
  if (request.action === "unregisterTab") {
    const tabId = sender.tab.id;
    if (registeredTabs[tabId]) {
      delete registeredTabs[tabId];
      console.log(`Tab ${tabId} unregistered`);
    }
    sendResponse({ success: true });
    return true;
  }
  
  if (request.action === "clearCache") {
    console.log("Clearing Q&A cache manually...");
    questionCache = [];
    answerCache = [];
    chrome.storage.local.set({
      'questionCache': questionCache,
      'answerCache': answerCache
    }, function() {
      console.log("Cache cleared successfully");
      sendResponse({ success: true });
    });
    return true; // Keep the message channel open for async response
  }

  if (request.action === "updateTabInfo") {
    // Get tab ID and tab info
    const tabId = sender.tab.id.toString();
    const tabInfo = request.data;
    
    console.log(`[DEBUG] Background received tab info for tab ${tabId}:`, tabInfo);
    
    // Store the tab info
    tabInfoMap.set(tabId, tabInfo);
    
    // Format the message for WebSocket
    const tabInfoMessage = {
      type: "tabInfo",
      tabId: tabId,
      title: tabInfo.title,
      url: tabInfo.url,
      favicon: tabInfo.favicon
    };
    

    // Send to WebSocket connection
    // sendToWebSocket(JSON.stringify(tabInfoMessage));

    // If WebSocket is connected, send tab info
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
      console.log("[DEBUG] Sending tabInfo message to WebSocket:", tabInfoMessage);
      sendWebSocketMessage(tabInfoMessage);
    } else {
      console.log(`WebSocket not connected or not ready, can't send tab info for ${tabId}`);
      console.log(`WebSocket status: ${wsConnection ? wsConnection.readyState : "null"}`);
      // Store for later registration when WebSocket connects
    }
    
    sendResponse({ success: true });
    return true;
  }  
  

});

// function sendToWebSocket(message) {
//   // Check if we have a WebSocket connection
//   if (typeof webSocketConnection !== 'undefined' && webSocketConnection) {
//     webSocketConnection.send(message);
//     return;
//   }
  
//   // Otherwise use the fetch API to forward to your backend
//   chrome.storage.sync.get(['apiUrl'], async function(result) {
//     try {
//       const apiUrl = result.apiUrl || 'http://localhost:3030';
      
//       await fetch(`${apiUrl}/api/message`, {
//         method: 'POST',
//         headers: {
//           'Content-Type': 'application/json'
//         },
//         body: message
//       });
      
//       console.log("Message sent to backend via fetch");
//     } catch (error) {
//       console.error("Error sending message:", error);
//     }
//   });
// }

// Function that will be injected into the page to click the submit button
function clickSubmitButton(platform) {
  console.log(`Attempting to click submit button for ${platform}`);
  
  // Set flag to indicate this is an extension-triggered click
  window.isExtensionTriggeredSend = true;
  
  if (platform === 'chatgpt') {
    // ChatGPT implementation
    const button = document.querySelector('button[data-testid="send-button"]');
    if (button && !button.disabled) {
      console.log("Found and clicking ChatGPT send button");
      button.click();
      // Add timeout to ensure event handling completes before resetting flag
      setTimeout(() => {
        window.isExtensionTriggeredSend = false;
      }, 100);
      return true;
    } else {
      console.log("ChatGPT button not found or is disabled");
      window.isExtensionTriggeredSend = false; // Reset flag if no button found
      return false;
    }
  } 
  else if (platform === 'claude') {
    // Claude implementation
    const claudeButton = document.querySelector('button[aria-label="Send message" i]');
    if (claudeButton && !claudeButton.disabled) {
      console.log("Found and clicking Claude send button");
      claudeButton.click();
      // Add timeout to ensure event handling completes before resetting flag
      setTimeout(() => {
        window.isExtensionTriggeredSend = false;
      }, 100);
      return true;
    } else {
      console.log("Claude button not found or is disabled");
      window.isExtensionTriggeredSend = false; // Reset flag if no button found
      return false;
    }
  }
  
  window.isExtensionTriggeredSend = false; // Reset flag if platform not supported
  return false;
}

// Function that will be injected into the page to click the copy button
function extractContentDirectly() {
  console.log(`Attempting to extract content`);
  
  // Platform detection based on hostname
  const hostname = window.location.hostname;
  const isClaude = hostname.includes('claude.ai');
  const isChatGPT = hostname.includes('chat.openai.com') || hostname.includes('chatgpt.com');
  
  // Helper function to wait for content to fully render
  function waitForComplete(element, maxAttempts = 5) {
    return new Promise((resolve) => {
      let attempts = 0;
      const initialContent = element.outerHTML;
      let lastContent = initialContent;
      
      const checkInterval = setInterval(() => {
        attempts++;
        const currentContent = element.outerHTML;
        
        // Check if content has changed
        if (currentContent === lastContent) {
          // If content hasn't changed for this interval, it might be stable
          if (attempts >= maxAttempts) {
            clearInterval(checkInterval);
            console.log(`Content stabilized after ${attempts} attempts`);
            resolve(currentContent);
          }
        } else {
          // Content changed, update last content and reset counter
          console.log("Content still changing, continuing to wait...");
          lastContent = currentContent;
          // Don't fully reset, but give more time
          attempts = Math.max(attempts - 1, 0);
        }
      }, 200);  // Check every 200ms
    });
  }
  
  if (isClaude) {
    // Claude-specific implementation for article extraction
    console.log(`Extracting article content from Claude`);
    
    // Get all assistant message containers
    const assistantContainers = document.querySelectorAll('div[data-is-streaming="false"]');

    if (assistantContainers.length === 0) {
      console.log("No Claude assistant containers found");
      return {success: false, error: "No Claude assistant containers found"};
    }

   // Get the last/most recent assistant container
   const lastAssistantContainer = assistantContainers[assistantContainers.length - 1];

   if (lastAssistantContainer) {
    return waitForComplete(lastAssistantContainer, 8).then(finalContent => {
      // Check again for article after waiting  
      let articleElement = lastAssistantContainer.querySelector('div[data-is-streaming]');
      articleElement = lastAssistantContainer.querySelector('.font-claude-message') || articleElement;
      
      if (articleElement) {
        // Found an article element - use its complete HTML (outer HTML)
        const articleContent = articleElement.outerHTML;
        console.log("Extracted full Claude article content length:", articleContent.length);
        
        return {
          success: true,
          content: articleContent,
          messageId: `claude_assistant_${new Date().getTime()}`
        };
      } else {
        // No article found - wrap the entire assistant container in article tags
        const wrappedContent = `<article>${lastAssistantContainer.innerHTML}</article>`;
        console.log("No article found - wrapped assistant content length:", wrappedContent.length);
        
        return {
          success: true,
          content: wrappedContent,
          messageId: `claude_assistant_${new Date().getTime()}`
        };
      }
    });
  } else {
      console.log("Claude copy button not found or is disabled");
      return {success: false, error: "Claude copy button not found or disabled"};
    }
  } 
  
  else if (isChatGPT) {

    // Original ChatGPT implementation - unchanged
    // const copyButtons = document.querySelectorAll('button[aria-label="Copy"]');

    // if (copyButtons.length === 0) {
    //   console.log("No copy buttons found");
    //   return {success: false, error: "No copy buttons found"};
    // }

    // Find all the articles in the page (ChatGPT responses are in article elements)
    const articles = document.querySelectorAll('article');
    
    if (articles.length === 0) {
      console.log("No ChatGPT articles found");
      return {success: false, error: "No ChatGPT articles found"};
    }
    
    // Get the last/most recent article (likely the latest response)
    const lastArticle = articles[articles.length - 1];
    
    if (lastArticle) {
      // Wait for content to stabilize before extracting
      return waitForComplete(lastArticle, 10).then(finalContent => {
        // Look also for any streaming animations to complete
        const streamingElements = lastArticle.querySelectorAll('.streaming-animation, ._animate_4f9by_25');
        if (streamingElements.length > 0) {
          console.log(`Found ${streamingElements.length} potentially streaming elements, waiting longer...`);
          // Additional wait for streaming elements
          return new Promise(resolve => setTimeout(() => resolve(lastArticle.outerHTML), 500));
        } else {
          return finalContent;
        }
      }).then(articleContent => {
        console.log("Extracted full ChatGPT article content length:", articleContent.length);
        
        // Get the message ID from the article if available
        const messageId = lastArticle.getAttribute('data-message-id') || `chatgpt_assistant_${new Date().getTime()}`;
        
        // Also check to make sure key elements like tables are fully rendered
        const hasTables = lastArticle.querySelectorAll('table').length > 0;
        if (hasTables) {
          console.log("Article contains tables, ensuring they're fully rendered");
          // Force a layout/reflow to ensure tables are properly rendered
          lastArticle.querySelectorAll('table').forEach(table => {
            table.getBoundingClientRect();
          });
          // Get the content again after forcing layout
          const updatedContent = lastArticle.outerHTML;
          return {
            success: true, 
            content: updatedContent,
            messageId: messageId
          };
        }
        
        return {
          success: true, 
          content: articleContent,
          messageId: messageId
        };
      });
    } else {
      console.log("ChatGPT article is empty");
      return {success: false, error: "ChatGPT article is empty"};
    }
  } 
  else {
    console.log("Unknown platform");
    return {success: false, error: "Unknown or unsupported platform"};
  }
}

// Test API connection
async function testApiConnection() {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(['apiUrl'], async function(result) {
      const apiUrl = result.apiUrl || 'http://localhost:3030';
      
      try {
        console.log(`Testing API connection to ${apiUrl}/api/prompts`);
        
        const response = await fetch(`${apiUrl}/api/prompts`);
        
        if (!response.ok) {
          resolve({ success: false, error: `Status: ${response.status}` });
          return;
        }
        
        const data = await response.json();
        
        if (data.status === 'success') {
          resolve({ success: true });
        } else {
          resolve({ success: false, error: 'Invalid response format' });
        }
      } catch (error) {
        resolve({ success: false, error: error.message });
      }
    });
  });
}

// Extended keep-alive mechanism
function setupExtendedKeepAlive() {
  // Keep service worker alive for extended periods
  const shortInterval = 15000; // 15 seconds
  const longInterval = 45000;  // 45 seconds
  
  // Fast pings when we have pending data
  const shortPing = setInterval(() => {
    const hasPendingData = questionCache.length > 0 || answerCache.length > 0;
    
    if (hasPendingData) {
      console.log("Short ping: Data pending, keeping worker alive");
      
      // If waiting too long with pending data, try upload again
      if (questionCache.length > 0 || answerCache.length > 0) {
        uploadCachedData();
      }
    }
  }, shortInterval);
  
  // Slower heartbeat for general keep-alive
  const longPing = setInterval(() => {
    console.log("Long ping: Service worker heartbeat");
    
    // Check for any interrupted uploads
    chrome.storage.local.get(['lastUploadAttempt'], function(result) {
      const lastAttempt = result.lastUploadAttempt || 0;
      const now = Date.now();
      
      // If it's been more than 2 minutes since last upload attempt and we have data
      if ((now - lastAttempt) > 120000 && (questionCache.length > 0 || answerCache.length > 0)) {
        console.log("Detected stalled upload, retrying...");
        uploadCachedData();
      }
    });
  }, longInterval);
  
  // Record upload attempts
  const originalUploadFn = uploadCachedData;
  uploadCachedData = function() {
    chrome.storage.local.set({'lastUploadAttempt': Date.now()});
    return originalUploadFn.apply(this, arguments);
  };
}

// Call the extended keep-alive setup
setupExtendedKeepAlive();

// Set up connection listener to keep the service worker active
chrome.runtime.onConnect.addListener(port => {
  console.log("Port connected:", port.name);
  
  port.onDisconnect.addListener(() => {
    console.log("Port disconnected");
  });
});


// Add this function to initialize WebSocket connection
function initWebSocketConnection() {
  // Get WebSocket URL from storage, default to localhost:3031
  chrome.storage.sync.get(['wsUrl'], function(result) {
    const wsUrl = result.wsUrl || 'ws://localhost:3031';
    connectToWebSocket(wsUrl);
  });
}

// Add function to connect to WebSocket
function connectToWebSocket(wsUrl) {
  // Clear any existing connection
  if (wsConnection) {
    wsConnection.close();
    wsConnection = null;
  }
  
  // Clear any reconnect timer
  if (wsReconnectTimer) {
    clearTimeout(wsReconnectTimer);
    wsReconnectTimer = null;
  }
  
  try {
    console.log(`Connecting to WebSocket at ${wsUrl}`);
    wsConnection = new WebSocket(wsUrl);
    
    // Add to your background.js after establishing the WebSocket connection
    wsConnection.onopen = function() {
      console.log('WebSocket connection established');
      
      // Send a hello message for the background script
      sendWebSocketMessage({
        type: 'hello',
        clientType: 'chrome-extension',
        version: '1.0.2',
        platform: 'chrome-extension'
      });
      
      // Register any pending tabs
      if (pendingTabRegistrations && pendingTabRegistrations.length > 0) {
        console.log(`Registering ${pendingTabRegistrations.length} pending tabs`);
        pendingTabRegistrations.forEach(tab => {
          sendWebSocketMessage({
            type: 'register_tab',
            tabId: tab.tabId,
            platform: tab.platform,
            url: tab.url
          });
        });
        pendingTabRegistrations = [];
      }
      
      // Then send individual platform registrations for each tab
      console.log(`Registering ${Object.keys(registeredTabs).length} existing tabs`);
      Object.entries(registeredTabs).forEach(([tabId, tabInfo]) => {
        sendWebSocketMessage({
          type: 'register_tab',
          tabId: tabId.toString(),
          platform: tabInfo.platform || "unknown",
          url: tabInfo.url || "unknown"
        });
      });
    };
    
    wsConnection.onmessage = function(event) {
      console.log('WebSocket message received:', event.data);
      
      try {
        const message = JSON.parse(event.data);
        
        // Validate the message token
        if (message.token !== AUTH_TOKEN) {
          console.error('Authentication failed: invalid or missing token');
          return;
        }
        
        // Remove token before processing the message
        const { token, ...messageData } = message;
        
        // Extract routing information
        const targetType = messageData.targetType || 'broadcast'; // 'broadcast', 'platform', 'client'
        const targetId = messageData.targetId; // tabId or platform name
        
        // Handle insertPrompt message
        if (messageData.type === 'insertPrompt') {
          routeMessageToContent(messageData, targetType, targetId);
        } 
        // Add new handler for creating a new chat
        else if (messageData.type === 'newChat') {
          // Handle new chat request
          handleNewChatRequest(messageData, targetType, targetId);
        }        
        // Add other message types as needed
        else {
          console.log(`Unknown message type: ${messageData.type}`);
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
      }
    };
    
    wsConnection.onclose = function(event) {
      console.log('WebSocket connection closed:', event.code, event.reason);
      scheduleReconnect(wsUrl);
    };
    
    wsConnection.onerror = function(error) {
      console.error('WebSocket error:', error);
      // The onclose handler will be called after this
    };
  } catch (error) {
    console.error('Error setting up WebSocket:', error);
    scheduleReconnect(wsUrl);
  }
}

// Function to schedule WebSocket reconnection
function scheduleReconnect(wsUrl) {
  if (wsReconnectTimer) {
    clearTimeout(wsReconnectTimer);
  }
  
  wsReconnectTimer = setTimeout(() => {
    console.log('Attempting to reconnect WebSocket...');
    connectToWebSocket(wsUrl);
  }, WS_RECONNECT_INTERVAL);
}

// Function to send message to WebSocket
function sendWebSocketMessage(message) {
  if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
    // Add the auth token to the message
    const messageWithToken = typeof message === 'string'
      ? { type: 'string_message', content: message, token: AUTH_TOKEN }
      : { ...message, token: AUTH_TOKEN };
    
    const messageString = typeof message === 'string' 
      ? JSON.stringify(messageWithToken) // Convert string messages to objects with token
      : JSON.stringify(messageWithToken);
      
    wsConnection.send(messageString);
    return true;
  }
  
  console.log('WebSocket not connected, cannot send message');
  return false;
}

// Initialize the extension - add WebSocket initialization
function initializeState() {
  chrome.storage.local.get(['questionCache', 'answerCache'], function(result) {
    if (result.questionCache) {
      questionCache = result.questionCache;
      console.log(`Loaded ${questionCache.length} cached questions`);
    }
    
    if (result.answerCache) {
      answerCache = result.answerCache;
      console.log(`Loaded ${answerCache.length} cached answers`);
    }
  });
  
  // Initialize WebSocket connection
  initWebSocketConnection();
}

// Add this new function for routing messages
function routeMessageToContent(message, targetType, targetId) {
  // Determine which tabs should receive the message
  let targetTabs = [];
  
  // Add debug logging for incoming values
  console.log(`Routing message with targetType: ${targetType}, targetId: ${targetId}`);
  
  if (targetType === 'broadcast') {
    // Send to all tabs
    targetTabs = Object.keys(registeredTabs);
    console.log(`Broadcasting to ${targetTabs.length} tabs`);
  } 
  else if (targetType === 'platform') {
    // Send to all tabs of a specific platform (chatgpt, claude, etc)
    targetTabs = Object.entries(registeredTabs)
      .filter(([_, info]) => info.platform === targetId)
      .map(([tabId, _]) => tabId);
    console.log(`Targeting platform ${targetId}, found ${targetTabs.length} matching tabs`);
  } 
  else if (targetType === 'client') {
    // Check if targetId has "tab_" prefix (from server) or if it's just the numeric ID
    if (targetId && targetId.toString().startsWith('tab_')) {
      // This is a tab ID from the server, extract just the number part
      const numericId = targetId.toString().replace('tab_', '');
      console.log(`Tab targeting: ID from server format, converted ${targetId} to ${numericId}`);
      
      if (registeredTabs[numericId]) {
        targetTabs = [numericId];
        console.log(`Found tab ${numericId}, will target specifically`);
      }
    } 
    // Otherwise check if it's a raw tab ID
    else if (registeredTabs[targetId]) {
      targetTabs = [targetId];
      console.log(`Found tab ${targetId}, will target specifically`);
    }
    else {
      console.log(`Tab ${targetId} not found in registered tabs. Known tabs:`, Object.keys(registeredTabs));
    }
  }
  
  console.log(`Routing message to ${targetTabs.length} tabs`);
  
  // Important: Fixed logic condition - Only fall back if not specifically targeting a tab
  if (targetTabs.length === 0 && targetType !== 'client') {
    console.log('No registered tabs match criteria, falling back to all tabs');
    chrome.tabs.query({}, function(tabs) {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {
          action: 'insertPrompt',
          prompt: message.prompt,
          autoSubmit: message.autoSubmit !== false,
          messageId: message.messageId || null
        }).catch(error => {
          // This is expected to fail for tabs that don't have our content script
          // console.log("Failed to send message to tab", tab.id, error);
        });
      });
    });
    return;
  }
  
  // If we're targeting a specific tab but didn't find it, log this
  if (targetTabs.length === 0 && targetType === 'client') {
    console.log(`Error: Could not find targeted tab ${targetId}. Not sending message.`);
    return;
  }
  
  // Send the message to each target tab
  targetTabs.forEach(tabId => {
    chrome.tabs.sendMessage(parseInt(tabId), {
      action: 'insertPrompt',
      prompt: message.prompt,
      autoSubmit: message.autoSubmit !== false,
      messageId: message.messageId || null
    }).catch(error => {
      console.log(`Failed to send message to tab ${tabId}:`, error);
      // Tab might be closed or not responding, clean up
      delete registeredTabs[tabId];
    });
  });
}

// Add this new function to handle the new chat request
function handleNewChatRequest(message, targetType, targetId) {
  console.log('Handling new chat request:', message);
  
  // Determine which tabs should receive the new chat command
  let targetTabs = [];
  
  if (targetType === 'broadcast') {
    // Only target ChatGPT tabs for broadcast
    targetTabs = Object.entries(registeredTabs)
      .filter(([_, info]) => info.platform === 'chatgpt')
      .map(([tabId, _]) => tabId);
    console.log(`Broadcasting new chat to ${targetTabs.length} ChatGPT tabs`);
  } 
  else if (targetType === 'platform') {
    // Target all tabs of the specified platform (either ChatGPT or Claude)
    const platform = targetId;
    targetTabs = Object.entries(registeredTabs)
      .filter(([_, info]) => info.platform === platform)
      .map(([tabId, _]) => tabId);
    console.log(`Targeting all ${platform} tabs, found ${targetTabs.length} matching tabs`);
  } 
  else if (targetType === 'client') {
    // Check if targetId has "tab_" prefix or if it's just the numeric ID
    const numericId = targetId.toString().replace('tab_', '');
    
    // Accept any tab regardless of platform
    if (registeredTabs[numericId]) {
      targetTabs = [numericId];
      console.log(`Found ChatGPT tab ${numericId}, will target specifically`);
    } else {
      console.log(`Tab ${numericId} is not a ChatGPT tab or not found`);
    }
  }
  
  // Execute script in each target tab based on its platform
  targetTabs.forEach(tabId => {
    const platform = registeredTabs[tabId]?.platform;
    
    // Choose the appropriate function based on the platform
    const scriptFunction = platform === 'claude' ? clickClaudeNewChat : clickNewChatButton;
    
    chrome.scripting.executeScript({
      target: { tabId: parseInt(tabId) },
      function: scriptFunction
    })
    .then(results => {
      console.log(`New chat button click executed in ${platform} tab`, tabId, ":", results);
      
      // Send result back via WebSocket
      if (results && results[0] && results[0].result) {
        const result = results[0].result;
        
        // Create the response message
        sendWebSocketMessage({
          type: 'newChatResult',
          tabId: tabId,
          platform: platform,
          success: result.success,
          message: result.message || result.error || 'Unknown result',
          ...result // Include all other details from the result
        });
      } else {
        // Handle case when no proper result returned
        sendWebSocketMessage({
          type: 'newChatResult',
          tabId: tabId,
          platform: platform,
          success: false,
          message: 'No result returned from script execution'
        });
      }
    })
    .catch(error => {
      console.error(`Error executing new chat script in ${platform} tab`, tabId, ":", error);
      
      // Send error via WebSocket
      sendWebSocketMessage({
        type: 'newChatResult',
        tabId: tabId,
        platform: platform,
        success: false, 
        message: `Error: ${error.message}`
      });
    });
  });
  
  // If no tabs were targeted, report failure
  if (targetTabs.length === 0) {
    sendWebSocketMessage({
      type: 'newChatResult',
      success: false,
      message: 'No matching AI assistant tabs found'
    });
  }
}

// Function that will be injected into the page to click the new chat button
function clickNewChatButton() {
  console.log("Attempting to click the New chat button on ChatGPT");
  
  // Find the button by its data-testid attribute
  const newChatButton = document.querySelector('button[data-testid="create-new-chat-button"]');
  
  if (newChatButton) {
    console.log("Found and clicking ChatGPT New chat button");
    
    // Store initial article count before clicking
    const initialArticleCount = document.querySelectorAll('article').length;
    console.log(`Initial article count: ${initialArticleCount}`);
    
    // Click the button
    newChatButton.click();
    
    // Set up a verification check with retry
    return new Promise((resolve) => {
      // First check after a short delay
      setTimeout(() => {
        const currentArticleCount = document.querySelectorAll('article').length;
        console.log(`First check article count: ${currentArticleCount}`);
        
        // If no articles found, the new chat was successful
        if (currentArticleCount === 0) {
          resolve({ 
            success: true, 
            message: "New chat created successfully"
          });
        } else {
          // If still have articles, try clicking again and check once more
          if (newChatButton) {
            console.log("Articles still present. Trying to click new chat button again...");
            newChatButton.click();
            
            // Second check after another delay
            setTimeout(() => {
              const finalArticleCount = document.querySelectorAll('article').length;
              console.log(`Final check article count: ${finalArticleCount}`);
              
              // Determine final success status
              if (finalArticleCount === 0) {
                resolve({ 
                  success: true, 
                  message: "New chat created successfully on second attempt"
                });
              } else {
                resolve({ 
                  success: false, 
                  message: `Failed to create new chat. Articles still present: ${finalArticleCount}`
                });
              }
            }, 1500); // Longer second check delay
          } else {
            resolve({ 
              success: false, 
              message: "Button disappeared after first click but articles still present"
            });
          }
        }
      }, 800); // Initial check delay
    });
  } else {
    console.log("ChatGPT New chat button not found");
    return { 
      success: false, 
      error: "Button not found"
    };
  }
}

// Function to trigger Claude's "New Chat" functionality with message count verification
function clickClaudeNewChat() {
  console.log("Attempting to trigger New Chat in Claude");
  
  // Count initial Claude messages
  const initialMessageCount = document.querySelectorAll('div.font-claude-message').length;
  console.log(`Initial Claude message count: ${initialMessageCount}`);
  
  // Direct approach: Find the New Chat link in the upper left corner and click it
  const newChatLink = document.querySelector('a[href="/new"]');
  
  if (newChatLink) {
    console.log("Found New Chat link, clicking it");
    newChatLink.click();
    
    // Check after a delay if it worked
    return new Promise((resolve) => {
      setTimeout(() => {
        // Count current Claude messages
        const currentMessageCount = document.querySelectorAll('div.font-claude-message').length;
        console.log(`Current Claude message count: ${currentMessageCount}`);
        
        if (currentMessageCount === 0 || currentMessageCount < initialMessageCount) {
          resolve({
            success: true,
            message: "New chat created successfully in Claude",
            method: "direct-link-click",
            initialMessageCount,
            finalMessageCount: currentMessageCount
          });
        } else {
          // If the direct click didn't work, try URL navigation as fallback
          console.log("Direct link click didn't work, trying URL navigation");
          
          // Store current URL to check if it changes
          const currentUrl = window.location.href;
          
          // Navigate to /new directly
          window.location.href = 'https://claude.ai/new';
          
          setTimeout(() => {
            const finalMessageCount = document.querySelectorAll('div.font-claude-message').length;
            
            if (window.location.href !== currentUrl || finalMessageCount === 0 || finalMessageCount < initialMessageCount) {
              resolve({
                success: true,
                message: "Created new chat by navigating to new chat URL",
                method: "url-navigation",
                initialMessageCount,
                finalMessageCount
              });
            } else {
              resolve({
                success: false,
                message: "Failed to create new chat in Claude",
                method: "all-failed",
                initialMessageCount,
                finalMessageCount
              });
            }
          }, 1500);
        }
      }, 1000);
    });
  } else {
    console.log("New Chat link not found, trying URL navigation");
    
    // Fallback to URL navigation
    const currentUrl = window.location.href;
    window.location.href = 'https://claude.ai/new';
    
    return new Promise((resolve) => {
      setTimeout(() => {
        const finalMessageCount = document.querySelectorAll('div.font-claude-message').length;
        
        if (window.location.href !== currentUrl || finalMessageCount === 0 || finalMessageCount < initialMessageCount) {
          resolve({
            success: true,
            message: "Created new chat by navigating to new chat URL",
            method: "url-navigation-direct",
            initialMessageCount,
            finalMessageCount
          });
        } else {
          resolve({
            success: false,
            message: "Failed to create new chat in Claude - couldn't find new chat link",
            method: "navigation-failed",
            initialMessageCount,
            finalMessageCount
          });
        }
      }, 1500);
    });
  }
}

