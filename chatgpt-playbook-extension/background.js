// background.js

// Caches for storing Q&A data until it can be uploaded
let questionCache = [];
let answerCache = [];
let uploadInProgress = false;
const UPLOAD_INTERVAL = 30000; // Upload every 30 seconds
const MAX_CACHE_SIZE = 100;

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
      metadata: a.metadata
    }));
    
    // Filter out answers with null question_ids
    const validAnswers = answers.filter(a => a.question_id !== null);

    console.log(`Uploading ${questions.length} questions and ${answers.length} answers to ${apiUrl}/api/qa`);
    
    // Send to API
    const response = await fetch(`${apiUrl}/api/qa`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ questions, answers })
    });
    
    if (!response.ok) {
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
});

// Function that will be injected into the page to click the submit button
function clickSubmitButton(platform) {
  console.log(`Attempting to click submit button for ${platform}`);
  
  if (platform === 'chatgpt') {
    // ChatGPT - Keep the existing implementation that works
    const button = document.querySelector('button[data-testid="send-button"]');
    if (button && !button.disabled) {
      console.log("Found and clicking ChatGPT send button");
      button.click();
      return true;
    } else {
      console.log("ChatGPT button not found or is disabled");
      return false;
    }
  } 
  else if (platform === 'claude') {
    // Claude - Based on the HTML snippet provided
    const claudeButton = document.querySelector('button[aria-label="Send Message"]');
    if (claudeButton && !claudeButton.disabled) {
      console.log("Found and clicking Claude send button");
      claudeButton.click();
      return true;
    } else {
      console.log("Claude button not found or is disabled");
      return false;
    }
  }
  
  return false;
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