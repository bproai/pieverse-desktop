// content.js

// Constants
const CHATGPT_INPUT_SELECTOR = '#prompt-textarea';
const CLAUDE_INPUT_SELECTOR = 'div[contenteditable="true"]';
const POLLING_INTERVAL = 100;
const MAX_RETRIES = 50;
const DEBUG = true;

// ChatGPT message selectors
const CHATGPT_QUESTION_SELECTOR = '[data-message-author-role="user"]';
const CHATGPT_ANSWER_SELECTOR = '[data-message-author-role="assistant"]';
const CHATGPT_CONVERSATION_TURN = 'article';

// Claude message selectors - preserved for future implementation
const CLAUDE_QUESTION_SELECTOR = '[data-message-author-role="user"]';
const CLAUDE_ANSWER_SELECTOR = '[data-message-author-role="assistant"]';
const CLAUDE_CONVERSATION_TURN = 'article';

// State
let retryCount = 0;
let pollingInterval = null;
let lastSubmittedQuestion = '';
let lastQuestionTimestamp = null;
let questionId = null;
let isWaitingForAnswer = false;
let answerObserver = null;

// Get current platform
function getCurrentPlatform() {
  const hostname = window.location.hostname;
  if (hostname.includes('chat.openai.com')) return 'chatgpt';
  if (hostname.includes('chatgpt.com')) return 'chatgpt';
  if (hostname.includes('claude.ai')) return 'claude';
  return null;
}

// Toggle search button state (enabled/disabled)
function toggleSearchButton(enabled) {
  console.log("Setting search button state to:", enabled ? "enabled" : "disabled");
  
  const platform = getCurrentPlatform();
  if (!platform) return;

  // Skip search button toggling for Claude as it doesn't have the same search functionality
  if (platform === 'claude') {
    console.log("Search button toggling not applicable for Claude platform");
    return;
  }
  
  // Find search button - only for ChatGPT
  let searchButton = document.querySelector('button[aria-label="Search"]');
  
  if (!searchButton) {
    console.log("Search button not found, will try again later");
    // Schedule a retry if button not found
    setTimeout(() => toggleSearchButton(enabled), 2000);
    return;
  }
  
  console.log("Found search button:", searchButton);
  
  // Check current state
  const ariaPressed = searchButton.getAttribute('aria-pressed');
  const isCurrentlyEnabled = ariaPressed === 'true';
  console.log("Current search button state:", isCurrentlyEnabled ? "enabled" : "disabled");
  
  // Only change state if different from current
  if (isCurrentlyEnabled !== enabled) {
    console.log("Changing search button state");
    
    // Click the button to toggle state if needed
    searchButton.click();
    
    // Schedule verification to ensure it worked
    setTimeout(() => {
      const nowPressed = searchButton.getAttribute('aria-pressed');
      console.log("Verification - button state now:", nowPressed === 'true' ? "enabled" : "disabled");
      
      // If state doesn't match expected state, try again
      if ((nowPressed === 'true') !== enabled) {
        console.log("Button state still doesn't match desired state, trying again");
        searchButton.click();
      }
    }, 300);
  } else {
    console.log("Search button already in desired state");
  }
}

// Start monitoring for answers
function startAnswerMonitoring(questionText) {
  console.log("Starting to monitor for answers to:", questionText);
  
  const platform = getCurrentPlatform();
  if (!platform) return;
  
  // Only proceed if we're on ChatGPT for now (keeping Claude code for future)
  // if (platform !== 'chatgpt') {
  //   console.log("Q&A tracking currently implemented only for ChatGPT");
  //   return;
  // }
  
  // Check if tracking is enabled in settings
  chrome.storage.sync.get(['trackQA'], function(result) {
    const trackQA = result.trackQA === undefined ? false : result.trackQA;
    console.log("Q&A tracking enabled:", trackQA);
    
    if (!trackQA) {
      console.log("Q&A tracking is disabled in settings");
      return;
    }
    
    lastSubmittedQuestion = questionText;
    lastQuestionTimestamp = new Date().toISOString();
    isWaitingForAnswer = true;
    
    // Generate a unique ID for this question
    questionId = `q_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    
    // Store the question in background page cache
    storeQuestionData({
      id: questionId,
      platform: platform,
      question: questionText,
      timestamp: lastQuestionTimestamp,
      answered: false
    });
    
    // Start observing for new answer elements
    setupAnswerObserver(platform);
  });
}

// Scan for existing answers on page load
function scanForExistingAnswers() {
  const answerElements = document.querySelectorAll(CHATGPT_ANSWER_SELECTOR);
  answerElements.forEach(answer => {
    // Check if this answer has already been processed
    if (!answer.dataset.qaProcessed) {
      // Ensure the answer is complete
      if (!answer.querySelector('[aria-busy="true"]') && isAnswerComplete(answer)) {
        console.log("Found existing complete answer; processing now.");
        processAnswer(answer);
      }
    }
  });
}

// Extract rich HTML and text content from an answer element
function extractRichAnswer(answerElement) {
  const platform = getCurrentPlatform();

  if (platform !== 'chatgpt') {
    // For Claude, the structure is different
    // First, find the container with the message content
    const claudeMessageContainer = answerElement.closest('.font-claude-message') || answerElement;
    
    // Try to locate the content grid where the actual message is
    const contentGrid = claudeMessageContainer.querySelector('div > div.grid.gap-2\\.5');
    
    if (contentGrid) {
      // Use the content grid if found
      const htmlContent = contentGrid.outerHTML;
      const plainText = contentGrid.innerText || contentGrid.textContent;
      return { plain_text: plainText.trim(), html: htmlContent.trim() };
    } else {
      // Fallback to the message container if grid not found
      const htmlContent = claudeMessageContainer.outerHTML;
      const plainText = claudeMessageContainer.innerText || claudeMessageContainer.textContent;
      return { plain_text: plainText.trim(), html: htmlContent.trim() };
    }
  }

  // Try to locate the rich content container
  let container = answerElement.querySelector('.markdown.prose') ||
                  answerElement.querySelector('.markdown') ||
                  answerElement.querySelector('.prose');
  
  // Fallback: if no specific container is found, use the entire answer element
  if (!container) {
    container = answerElement;
  }
  
  // Use outerHTML to capture all the rich HTML content
  const htmlContent = container.outerHTML.trim();
  
  // Also capture the plain text for search or indexing purposes
  const plainText = container.innerText.trim();
  
  return { plain_text: plainText, html: htmlContent };
}

// Check if an answer is complete by looking for UI elements that appear when generation is done
function isAnswerComplete(answerElement) {
  const platform = getCurrentPlatform();

  if (platform !== 'chatgpt') {
    // For Claude, we need to check several things:
    
    // 1. Check if the div has data-is-streaming="false" attribute
    // This is the most reliable indicator for Claude
    const isStreamingContainer = answerElement.closest('div[data-is-streaming]');
    if (isStreamingContainer) {
      const isStreaming = isStreamingContainer.getAttribute('data-is-streaming') === 'true';
      if (isStreaming) {
        console.log("Claude answer is still streaming");
        return false;
      }
    }
    
    // 2. Find the font-claude-message container
    const messageContainer = answerElement.closest('.font-claude-message');
    if (!messageContainer) {
      console.log("DETECTION ISSUE: Could not find font-claude-message container");
      return false;
    }
    
    // 3. Check for content
    const paragraphs = messageContainer.querySelectorAll('p, pre, ol, ul, table');
    const hasContent = paragraphs.length > 0;
    
    // 4. Look for UI elements - this will be used in our OR condition
    const parentContainer = answerElement.closest('.group') || 
                          isStreamingContainer?.parentElement ||
                          answerElement.parentElement;
    
    // Look for any of these UI elements
    const copySvg = parentContainer?.querySelector('svg[data-testid="action-bar-copy"]');
    const thumbsUpButton = parentContainer?.querySelector('[aria-label="Give positive feedback"]');
    const thumbsDownButton = parentContainer?.querySelector('[aria-label="Give negative feedback"]');
    const retryButton = parentContainer?.querySelector('button[aria-haspopup="menu"]');
    
    const hasUIElements = copySvg || thumbsUpButton || thumbsDownButton || retryButton;
    
    console.log("Claude answer completion check:", {
      hasContent: hasContent,
      hasCopySvg: !!copySvg,
      hasUIElements: !!hasUIElements,
      isStreamingDone: isStreamingContainer ? isStreamingContainer.getAttribute('data-is-streaming') === 'false' : 'unknown'
    });
    
    // Consider the answer complete if EITHER:
    // 1. Streaming is done AND there's content
    // OR
    // 2. We found UI elements (even if they're hidden until hover)
    return (isStreamingContainer && 
            isStreamingContainer.getAttribute('data-is-streaming') === 'false' && 
            hasContent) || hasUIElements;
  }  

  // We need to look for buttons outside the answer element itself
  // First, find the article that contains everything
  const article = answerElement.closest('article');
  
  if (!article) {
    console.log("DETECTION ISSUE: Answer element is not within an article element");
    return false;
  }
  
  // Now look for buttons within this article
  const copyButton = article.querySelector('button[aria-label="Copy"]');
  const thumbsButtons = article.querySelectorAll('button[aria-label="Good response"], button[aria-label="Bad response"]');
  const readAloudButton = article.querySelector('button[aria-label="Read aloud"]');
  
  // If we find these UI elements, the answer is complete
  const hasCompletionUI = copyButton || thumbsButtons.length > 0 || readAloudButton;
  
  // Also make sure there's no loading indicator
  const isStillLoading = !!answerElement.querySelector('[aria-busy="true"]');
  
  // Check for streaming indicators
  const isStreaming = answerElement.querySelector('.result-streaming') || 
                      answerElement.querySelector('.result-thinking');
  
  console.log("Answer completion check:", {
    hasCopyButton: !!copyButton,
    hasThumbsButtons: thumbsButtons.length > 0,
    hasReadAloudButton: !!readAloudButton,
    isStillLoading: isStillLoading,
    isStreaming: !!isStreaming,
    messageId: answerElement.getAttribute('data-message-id')
  });
  
  return hasCompletionUI && !isStillLoading && !isStreaming;
}

// Validate if an answer is complete and worth storing
function isValidAnswer(richAnswer, modelInfo, answerElement) {
  const platform = getCurrentPlatform();

  if (platform !== 'chatgpt') {
    // Check if the answer is empty or too short
    if (!richAnswer.plain_text || richAnswer.plain_text.trim().length < 2) {
      console.log("VALIDATION FAILED: Claude answer too short or empty");
      return false;
    }
    
    // Check if the message container has stopped streaming
    const isStreamingContainer = answerElement.closest('div[data-is-streaming]');
    if (isStreamingContainer && isStreamingContainer.getAttribute('data-is-streaming') === 'true') {
      console.log("VALIDATION FAILED: Claude answer is still streaming");
      return false;
    }
    
    // Look for the Claude message container - this must exist
    const messageContainer = answerElement.closest('.font-claude-message');
    if (!messageContainer) {
      console.log("VALIDATION FAILED: Missing font-claude-message container");
      return false;
    }
    
    // Check for actual content - this is our primary validation criterion
    const paragraphs = messageContainer.querySelectorAll('p, pre, ol, ul, table');
    const hasRealContent = paragraphs.length > 0;
    if (!hasRealContent) {
      console.log("VALIDATION FAILED: No content paragraphs found in Claude answer");
      return false;
    }
    
    // Look for UI elements as a secondary validation method
    const parentContainer = answerElement.closest('.group') || 
                            answerElement.closest('[data-is-streaming]') ||
                            answerElement.parentElement;
    
    if (parentContainer) {
      // Look for any UI elements
      const copySvg = parentContainer.querySelector('svg[data-testid="action-bar-copy"]');
      const copyButton = parentContainer.querySelector('button[data-testid="action-bar-copy"]');
      const thumbsUpButton = parentContainer.querySelector('[aria-label="Give positive feedback"]');
      const thumbsDownButton = parentContainer.querySelector('[aria-label="Give negative feedback"]');
      const retryButton = parentContainer.querySelector('button[aria-haspopup="menu"]');
      
      // Log what was found but don't require any specific element
      console.log("Claude UI elements found:", {
        hasCopySvg: !!copySvg,
        hasCopyButton: !!copyButton,
        hasThumbsUpButton: !!thumbsUpButton,
        hasThumbsDownButton: !!thumbsDownButton,
        hasRetryButton: !!retryButton
      });
    }
    
    // // Claude answers sometimes have placeholder text at the beginning
    // const hasPlaceholderText = richAnswer.plain_text.includes("I'd be happy to help") && 
    //                          richAnswer.plain_text.length < 500 &&
    //                          (richAnswer.plain_text.includes("provide") || richAnswer.plain_text.includes("share"));
                             
    // if (hasPlaceholderText) {
    //   console.log("VALIDATION FAILED: Detected Claude placeholder text");
    //   return false;
    // }
    
    // Set a reasonable model info for Claude even if not explicitly detected
    if (!modelInfo || modelInfo.model === 'unknown') {
      // This won't affect the validity check but will help with logging
      console.log("Using default model info for Claude");
      modelInfo = { model: 'Claude', modelSlug: 'claude' };
    }
    
    console.log("VALIDATION PASSED: Claude answer is complete and valid");
    return true;
  }
  
  // Log some details for debugging
  console.log("Validating answer:", {
    modelInfo,
    plainTextLength: richAnswer.plain_text?.length || 0,
    htmlSnippet: richAnswer.html?.substring(0, 100) + "..." || "none"
  });

  // Check if model information is missing or incomplete
  if (!modelInfo || modelInfo.model === 'unknown' || modelInfo.modelSlug === null) {
    console.log("VALIDATION FAILED: Model information incomplete", { model: modelInfo?.model, slug: modelInfo?.modelSlug });
    return false;
  }
  
  // Check if the answer is the "thinking" placeholder
  if (richAnswer.html && (
      richAnswer.html.includes('result-thinking') || 
      richAnswer.html.includes('result-streaming') ||
      richAnswer.plain_text === '\u200b' || 
      richAnswer.plain_text.trim() === '')) {
    console.log("VALIDATION FAILED: Detected empty/placeholder/streaming answer", { 
      hasThinking: richAnswer.html?.includes('result-thinking'),
      hasStreaming: richAnswer.html?.includes('result-streaming'),
      isZeroWidth: richAnswer.plain_text === '\u200b',
      isEmpty: richAnswer.plain_text.trim() === ''
    });
    return false;
  }
  
  // Check for UI elements that indicate a complete answer
  // This check should use the article parent to find UI elements
  const article = answerElement.closest('article');
  const hasCompletionUI = article && (
      article.querySelector('button[aria-label="Copy"]') ||
      article.querySelector('button[aria-label="Good response"]') ||
      article.querySelector('button[aria-label="Bad response"]')
  );
  
  if (!hasCompletionUI) {
    console.log("VALIDATION FAILED: Missing completion UI elements in article parent");
    return false;
  }
  
  // Check for truncated sentences (ending without proper punctuation)
  const text = richAnswer.plain_text || '';
  const lastChar = text.trim().slice(-1);
  const properEndings = ['.', '!', '?', ':', ';', '"', "'", ')', ']', '}'];
  
  // If text is longer than 100 chars and doesn't end with proper punctuation,
  // it might be truncated
  if (text.length > 100 && !properEndings.includes(lastChar)) {
    const lastWord = text.trim().split(/\s+/).pop() || '';
    // If the last word is very short (less than 3 chars), it's likely truncated
    if (lastWord.length < 3 || /^[a-z]/.test(lastWord)) {
      console.log("VALIDATION FAILED: Detected likely truncated answer", {
        lastChar,
        lastWord,
        properEnding: properEndings.includes(lastChar)
      });
      return false;
    }
  }
  
  // Check minimum content length
  if (!richAnswer.plain_text || richAnswer.plain_text.trim().length < 3) {
    console.log("VALIDATION FAILED: Answer too short or empty", {
      length: richAnswer.plain_text?.trim().length
    });
    return false;
  }
  
  console.log("VALIDATION PASSED: Answer is complete and valid");
  return true;
}

// Process a found answer element
function processAnswer(latestAnswer) {
  // Skip if this answer element was already processed
  if (latestAnswer.dataset.qaProcessed === "true") {
    console.log("Answer already processed, skipping duplicate.");
    return;
  }
  
  // Extract answer text and model info
  const richAnswer = extractRichAnswer(latestAnswer);
  const modelInfo = extractModelInfo(latestAnswer, getCurrentPlatform());
  
  // Validate the answer before storing it - pass the answer element too
  if (!isValidAnswer(richAnswer, modelInfo, latestAnswer)) {
    console.log("Answer validation failed, not storing but will continue monitoring");
    
    // Don't mark as processed, so we can try again
    // Instead, mark with a "pending" flag to indicate we need to check again
    latestAnswer.dataset.qaPending = "true";
    
    // Set up a retry for this specific answer after a delay
    setTimeout(() => {
      if (latestAnswer.dataset.qaProcessed !== "true") {
        console.log("Retrying processing of previously incomplete answer");
        // Get the answer again (it might have been updated)
        const updatedRichAnswer = extractRichAnswer(latestAnswer);
        const updatedModelInfo = extractModelInfo(latestAnswer, getCurrentPlatform());
        
        if (isValidAnswer(updatedRichAnswer, updatedModelInfo, latestAnswer)) {
          console.log("Answer is now valid, processing");
          storeValidAnswer(latestAnswer, updatedRichAnswer, updatedModelInfo);
          
          // Call the background script to handle the copy button click
          console.log("Sending clickCopyButton message to background script");
          chrome.runtime.sendMessage({
            action: "clickCopyButton",
            platform: getCurrentPlatform()
          }, response => {
            console.log("Background script response to clickCopyButton:", response);
          });
        } else {
          console.log("Answer still invalid after retry");
        }
      }
    }, 5000); // Check again after 5 seconds
    
    return;
  }
  
  // Answer is valid, store it
  storeValidAnswer(latestAnswer, richAnswer, modelInfo);
  
  // Call the background script to handle the copy button click
  console.log("Sending clickCopyButton message to background script");
  chrome.runtime.sendMessage({
    action: "clickCopyButton",
    platform: getCurrentPlatform()
  }, response => {
    console.log("Background script response to clickCopyButton:", response);
    
    if (response && response.success) {
      if (response.contentExtracted) {
        console.log("Content successfully extracted and sent via WebSocket, length:", response.contentLength);
      } else {
        console.log("Copy button clicked but content not directly extracted");
      }
    } else {
      const platform = getCurrentPlatform();
      if (platform!=='chatgpt') {
        console.log("Copy button click action skipped for Claude.");
      }
      else 
        console.error("Failed to click copy button:", response ? response.error : "Unknown error");
    }
  });
}

// Store a validated answer
function storeValidAnswer(answerElement, richAnswer, modelInfo) {
  // Mark as processed
  answerElement.dataset.qaProcessed = "true";
  
  const answerJsonString = JSON.stringify(richAnswer);
  const answerTimestamp = new Date().toISOString();
  
  // Get the conversation turn element to extract turn number
  const turnElement = answerElement.closest(CHATGPT_CONVERSATION_TURN);
  const turnNumber = turnElement
    ? turnElement.getAttribute('data-testid')?.replace('conversation-turn-', '')
    : null;
  
  // Store the answer data
  storeAnswerData({
    id: `a_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    question_id: questionId,
    message_id: answerElement.getAttribute('data-message-id'),
    platform: getCurrentPlatform(),
    answer: answerJsonString,
    model: modelInfo.model,
    timestamp: answerTimestamp,
    turn_number: turnNumber ? parseInt(turnNumber) : null,
    metadata: JSON.stringify({
      messageAttributes: extractMessageAttributes(answerElement),
      modelSlug: modelInfo.modelSlug
    })
  });
  
  isWaitingForAnswer = false;
}

// Check for pending answers that might now be complete
function scanForPendingAnswers() {
  const platform = getCurrentPlatform();
  if (!platform) return;
  
  const answerSelector = platform === 'claude' ? CLAUDE_ANSWER_SELECTOR : CHATGPT_ANSWER_SELECTOR;
  const pendingAnswers = document.querySelectorAll(`${answerSelector}[data-qa-pending="true"]:not([data-qa-processed="true"])`);
  
  console.log(`Found ${pendingAnswers.length} pending answers to check`);
  
  pendingAnswers.forEach(answer => {
    // Check if it's now complete
    if (isAnswerComplete(answer)) {
      console.log("Found a pending answer that's now complete");
      const richAnswer = extractRichAnswer(answer);
      const modelInfo = extractModelInfo(answer, platform);
      
      if (isValidAnswer(richAnswer, modelInfo)) {
        console.log("Pending answer is now valid, processing");
        storeValidAnswer(answer, richAnswer, modelInfo);
      } else {
        console.log("Pending answer still invalid");
      }
    }
  });
}

// Set up periodic scan for pending answers
setInterval(scanForPendingAnswers, 10000);

// Set up the main observer for answer elements
function setupAnswerObserver(platform) {
  if (answerObserver) {
    answerObserver.disconnect();
  }
  
  const answerSelector = platform === 'claude' ? CLAUDE_ANSWER_SELECTOR : CHATGPT_ANSWER_SELECTOR;
  
  // Find the best container to observe
  let conversationContainer;
  if (platform === 'claude') {
    // For Claude, try to find the most specific container possible
    conversationContainer = document.querySelector('#claude-chat-container') || 
                           document.querySelector('.chat-container') ||
                           document.querySelector('[data-is-streaming]')?.closest('.h-full') ||
                           document.querySelector('main') || 
                           document;
  } else {
    // For ChatGPT, use the main container
    conversationContainer = document.querySelector('main') || document;
  }
  
  console.log(`Setting up ${platform} answer observer on container:`, conversationContainer);
  
  // Track the latest answer we've seen
  let latestAnswerSeen = null;
  let completionCheckInterval = null;
  
  // Function to start monitoring an answer element
  function startMonitoringAnswer(answerElement) {
    // Only start if we're not already monitoring this element
    if (latestAnswerSeen === answerElement) return;
    
    console.log(`Starting to monitor new ${platform} answer element:`, answerElement);
    latestAnswerSeen = answerElement;
    
    // Clear any existing interval
    if (completionCheckInterval) {
      clearInterval(completionCheckInterval);
    }
    
    // For logging less frequently
    let logCounter = 0;
    
    // Start checking for completion
    completionCheckInterval = setInterval(() => {
      if (!isWaitingForAnswer) {
        clearInterval(completionCheckInterval);
        return;
      }
      
      // Check if answer is complete
      if (isAnswerComplete(answerElement)) {
        console.log(`${platform} answer appears complete! Processing now.`);
        clearInterval(completionCheckInterval);
        
        // Wait a short moment to ensure everything is rendered
        setTimeout(() => {
          if (isWaitingForAnswer) {
            processAnswer(answerElement);
          }
        }, 1000);
      } else {
        // Only log every 5th time (or whatever number you prefer)
        logCounter++;
        if (logCounter % 5 === 0) {
          console.log(`${platform} answer still being generated, waiting...`);
        }
      }
    }, 2000); // Check every 2 seconds
  }
  
  // Observer for new answers
  answerObserver = new MutationObserver((mutations) => {
    if (!isWaitingForAnswer) return;
    
    if (platform === 'claude') {
      // For Claude, we need to look for divs with certain classes
      for (const mutation of mutations) {
        if (mutation.type === 'childList' || mutation.type === 'attributes') {
          // Check for completed message containers
          const completedMessages = document.querySelectorAll('div[data-is-streaming="false"] .font-claude-message');
          if (completedMessages.length > 0) {
            const latestMessage = completedMessages[completedMessages.length - 1];
            startMonitoringAnswer(latestMessage);
          }
          
          // Also look for answers based on the selector
          const answerElements = document.querySelectorAll(answerSelector);
          if (answerElements.length > 0) {
            const latestAnswer = answerElements[answerElements.length - 1];
            startMonitoringAnswer(latestAnswer);
          }
        }
      }
    } else {
      // Original ChatGPT implementation
      // Look for answers in the mutations
      const answerElements = document.querySelectorAll(answerSelector);
      if (answerElements.length > 0) {
        const latestAnswer = answerElements[answerElements.length - 1];
        startMonitoringAnswer(latestAnswer);
      }
    }
  });
  
  // Start observing for changes to the conversation
  answerObserver.observe(conversationContainer, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-is-streaming'] // Important for Claude
  });
  
  console.log(`Answer observer set up for platform: ${platform}`);
  
  // Immediately check for existing answers
  if (platform === 'claude') {
    // For Claude, check multiple possible answer elements
    const completedMessages = document.querySelectorAll('div[data-is-streaming="false"] .font-claude-message');
    if (completedMessages.length > 0) {
      const latestMessage = completedMessages[completedMessages.length - 1];
      startMonitoringAnswer(latestMessage);
    }
  }
  
  const existingAnswers = document.querySelectorAll(answerSelector);
  if (existingAnswers.length > 0) {
    const latestAnswer = existingAnswers[existingAnswers.length - 1];
    startMonitoringAnswer(latestAnswer);
  }
  
  // Start fallback polling in case observer misses the answer element
  pollForAnswer(answerSelector, platform);
  
  // Also set up a long-running fallback check
  setupLongRunningFallback(answerSelector, platform);
}

// Fallback polling to capture the answer element if not caught by the observer
function pollForAnswer(answerSelector, platform, maxPollTime = 30000, pollInterval = 1000) {
  let elapsed = 0;
  const intervalId = setInterval(() => {
    if (platform === 'claude') {
      // For Claude, check completed messages first
      const completedMessages = document.querySelectorAll('div[data-is-streaming="false"] .font-claude-message');
      if (completedMessages.length > 0) {
        const latestMessage = completedMessages[completedMessages.length - 1];
        if (isAnswerComplete(latestMessage)) {
          console.log("Polling found a complete Claude answer element; processing now");
          processAnswer(latestMessage);
          clearInterval(intervalId);
          return;
        }
      }
    }
    
    // Then check using the standard selector as fallback
    const answerElements = document.querySelectorAll(answerSelector);
    if (answerElements.length > 0) {
      const latestAnswer = answerElements[answerElements.length - 1];
      // Check if the answer is complete
      if (isAnswerComplete(latestAnswer)) {
        console.log("Polling found a complete answer element; processing now");
        processAnswer(latestAnswer);
        clearInterval(intervalId);
        return;
      }
    }
    
    elapsed += pollInterval;
    if (elapsed >= maxPollTime) {
      console.log("Polling timeout reached without finding a complete answer element");
      clearInterval(intervalId);
    }
  }, pollInterval);
}

// Extra fallback for very long running generations
function setupLongRunningFallback(answerSelector, platform) {
  // Set up a repeated check that runs less frequently but for a longer time
  const maxChecks = 20; // Up to 2 minutes of waiting
  let checkCount = 0;
  
  const longRunningInterval = setInterval(() => {
    checkCount++;
    
    // Stop checking if we're no longer waiting or we've reached max checks
    if (!isWaitingForAnswer || checkCount > maxChecks) {
      clearInterval(longRunningInterval);
      return;
    }
    
    console.log(`Long-running fallback check ${checkCount}/${maxChecks} for ${platform}`);
    
    if (platform === 'claude') {
      // For Claude, check completed messages first
      const completedMessages = document.querySelectorAll('div[data-is-streaming="false"] .font-claude-message');
      if (completedMessages.length > 0) {
        const latestMessage = completedMessages[completedMessages.length - 1];
        if (isAnswerComplete(latestMessage)) {
          console.log("Long-running fallback found complete Claude answer");
          setTimeout(() => {
            if (isWaitingForAnswer) {
              processAnswer(latestMessage);
            }
          }, 500);
          
          clearInterval(longRunningInterval);
          return;
        }
      }
    }
    
    // Find all answers and check the latest one
    const answerElements = document.querySelectorAll(answerSelector);
    if (answerElements.length > 0) {
      const latestAnswer = answerElements[answerElements.length - 1];
      
      if (isAnswerComplete(latestAnswer)) {
        console.log("Long-running fallback found complete answer");
        setTimeout(() => {
          if (isWaitingForAnswer) {
            processAnswer(latestAnswer);
          }
        }, 500);
        
        clearInterval(longRunningInterval);
      }
    }
  }, 6000); // Check every 6 seconds
}

// Extract model information
function extractModelInfo(answerElement, platform) {
  let model = 'unknown';
  let modelSlug = null;
  
  if (platform === 'chatgpt') {
    try {
      // First attempt - get model from attribute
      modelSlug = answerElement.getAttribute('data-message-model-slug');
      if (modelSlug && modelSlug !== 'null') {
        model = modelSlug; // Use the slug as model if available
      }
      
      // Second attempt - look for the model in the span
      if (model === 'unknown') {
        const modelSpan = document.querySelector('.overflow-hidden.text-clip.whitespace-nowrap.text-sm');
        if (modelSpan && modelSpan.textContent) {
          model = modelSpan.textContent.trim();
        }
      }
      
      // Third attempt - look for button with model info
      if (model === 'unknown') {
        const modelButton = document.querySelector('[id^="radix-"] .overflow-hidden');
        if (modelButton && modelButton.textContent) {
          model = modelButton.textContent.trim();
        }
      }
      
      // Fourth attempt - check for o3-mini directly in the DOM
      if (model === 'unknown') {
        const modelMenuButton = document.querySelector('button[aria-haspopup="menu"]');
        if (modelMenuButton && modelMenuButton.textContent.includes('o3-mini')) {
          model = 'o3-mini';
        }
      }
    } catch (error) {
      console.error("Error extracting model info:", error);
    }
  } 
  else if (platform === 'claude') {
    try {
      // Try to find the model selector dropdown for Claude
      const claudeModelSelector = document.querySelector('button[data-testid="model-selector-dropdown"]');
      if (claudeModelSelector) {
        // Find the model name div within the selector
        const modelNameDiv = claudeModelSelector.querySelector('div.whitespace-nowrap');
        if (modelNameDiv && modelNameDiv.textContent) {
          // Extract the text content and trim any whitespace
          const modelText = modelNameDiv.textContent.trim();
          model = 'Claude ' + modelText;
          
          // Convert to a slug format (e.g., "Claude 3.7 Sonnet" -> "claude-3-7-sonnet")
          modelSlug = 'claude-' + modelText.toLowerCase().replace(/\s+/g, '-').replace(/\./g, '-');
          console.log("Extracted Claude model info:", { model, modelSlug, modelText });
        }
      }
      
      // Fallback to previous methods if the selector wasn't found
      if (model === 'unknown') {
        modelSlug = 'claude';
        model = 'Claude'; // Default if we can't determine version
        
        // Check page content for Claude version indicators
        const pageContent = document.body.innerText;
        if (pageContent.includes('Claude 3 Opus')) {
          model = 'Claude 3 Opus';
          modelSlug = 'claude-3-opus';
        } else if (pageContent.includes('Claude 3 Sonnet')) {
          model = 'Claude 3 Sonnet';
          modelSlug = 'claude-3-sonnet';
        } else if (pageContent.includes('Claude 3 Haiku')) {
          model = 'Claude 3 Haiku';
          modelSlug = 'claude-3-haiku';
        } else if (pageContent.includes('Claude 3')) {
          model = 'Claude 3';
          modelSlug = 'claude-3';
        } else if (pageContent.includes('Claude 2')) {
          model = 'Claude 2';
          modelSlug = 'claude-2';
        }
        
        // Try to find model in the header
        const modelHeader = document.querySelector('header h1, header h2');
        if (modelHeader && modelHeader.textContent.includes('Claude')) {
          model = modelHeader.textContent.trim();
        }
      }
    } catch (error) {
      console.error("Error extracting Claude model info:", error);
    }
  }
  
  return { model, modelSlug };
}

// Diagnostic function for debugging elements
function logElementDiagnostics(element, label) {
  console.log(`--- ${label} Diagnostics ---`);
  console.log("Element:", element);
  
  if (!element) {
    console.log("Element is null or undefined");
    return;
  }
  
  console.log("Classes:", element.className);
  console.log("Attributes:", Array.from(element.attributes).map(a => `${a.name}="${a.value}"`).join(', '));
  
  // Check for specific elements
  console.log("Contains .markdown.prose:", !!element.querySelector('.markdown.prose'));
  console.log("Contains .markdown:", !!element.querySelector('.markdown'));
  console.log("Contains [data-is-last-node]:", !!element.querySelector('[data-is-last-node]'));
  
  // Add model-specific checks
  const modelSlug = element.getAttribute('data-message-model-slug');
  console.log("data-message-model-slug:", modelSlug);
  
  // Get a sample of text
  const textSample = element.textContent.substring(0, 200) + (element.textContent.length > 200 ? '...' : '');
  console.log("Text Content Sample:", textSample);
}

// Extract all available message attributes
function extractMessageAttributes(element) {
  const attributes = {};
  
  // Get all data attributes
  for (const attr of element.attributes) {
    if (attr.name.startsWith('data-')) {
      attributes[attr.name] = attr.value;
    }
  }
  
  return attributes;
}

// Store question data via background script
function storeQuestionData(questionData) {
  chrome.runtime.sendMessage({
    action: "storeQuestionData",
    data: questionData
  }, response => {
    console.log("Background response to question data:", response);
  });
}

// Store answer data via background script
function storeAnswerData(answerData) {
  chrome.runtime.sendMessage({
    action: "storeAnswerData",
    data: answerData
  }, response => {
    console.log("Background response to answer data:", response);
  });
}

// Message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Received message:", request);

  if (request.action === "insertPrompt") {
    // Get current platform
    const platform = getCurrentPlatform();
    if (!platform) {
      console.error("Unsupported platform");
      sendResponse({ success: false, error: "Unsupported platform" });
      return;
    }

    // Clear any existing polling interval
    if (pollingInterval) {
      clearInterval(pollingInterval);
    }

    // Reset retry count
    retryCount = 0;

    // Poll for input element
    pollingInterval = setInterval(() => {
      // Select appropriate input selector based on platform
      const selector = platform === 'claude' ? CLAUDE_INPUT_SELECTOR : CHATGPT_INPUT_SELECTOR;
      const inputBox = document.querySelector(selector);
      console.log("Trying to find input box:", inputBox, "for platform:", platform);

      if (inputBox) {
        // Clear the interval once element is found
        clearInterval(pollingInterval);

        // Insert the prompt
        if (platform === 'claude') {
          // Claude.ai specific handling
          inputBox.textContent = request.prompt;
          inputBox.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          // ChatGPT handling
          inputBox.value = request.prompt;
          inputBox.innerHTML = request.prompt;
          inputBox.dispatchEvent(new Event('input', { bubbles: true }));
        }

        // Focus the input
        inputBox.focus();

        // Start monitoring for answers
        startAnswerMonitoring(request.prompt);

        // Send success response
        sendResponse({ success: true });
        
        // Only call the background script if autoSubmit is enabled
        if (request.autoSubmit) {
          // Get current tab ID and call the background script to execute the click
          console.log("Auto-submit is enabled, will attempt to submit prompt");
          setTimeout(() => {
            console.log("Sending clickSubmitButton message to background script");
            chrome.runtime.sendMessage({
              action: "clickSubmitButton",
              platform: platform
            }, response => {
              console.log("Background script response to clickSubmitButton:", response);
            });
          }, 500);
        }
      } else if (retryCount >= MAX_RETRIES) {
        // Clear interval if max retries reached
        clearInterval(pollingInterval);
        console.error("Failed to find input element after max retries");
        sendResponse({ success: false, error: "Input element not found" });
      }

      retryCount++;
    }, POLLING_INTERVAL);

    // Keep message channel open for async response
    return true;
  }
  
  // Handle toggle search button message
  if (request.action === "toggleSearch") {
    toggleSearchButton(request.enabled);
    sendResponse({ success: true });
    return true;
  }
});

// Keep connection to background script alive
function establishPersistentConnection() {
  const port = chrome.runtime.connect({name: "keepAlive"});
  port.onDisconnect.addListener(() => {
    console.log("Port disconnected, attempting to reconnect...");
    setTimeout(establishPersistentConnection, 1000);
  });
}

// Set up persistent connection
establishPersistentConnection();

// When content script loads, check if search should be enabled/disabled
chrome.storage.sync.get(['searchEnabled'], function(result) {
  if (typeof result.searchEnabled !== 'undefined') {
    const searchEnabled = result.searchEnabled;
    console.log('Initial search button setting:', searchEnabled);
    
    // Apply the setting after a delay to ensure page has loaded
    setTimeout(() => {
      toggleSearchButton(searchEnabled);
    }, 2000);
  }
});

// Set up an initial scan after the page loads
window.addEventListener('load', () => {
  // Give the page a moment to render all existing answers
  setTimeout(() => {
    console.log("Scanning for pre-rendered answers after page load...");
    scanForExistingAnswers();
  }, 2000);
  
  console.log("Page loaded, setting up conversation monitoring");
  
  // Get current platform
  const platform = getCurrentPlatform();
  if (!platform) return;
  
  // Check if tracking is enabled and only apply for ChatGPT for now
  // if (platform !== 'chatgpt') return;
  
  chrome.storage.sync.get(['trackQA'], function(result) {
    const trackQA = result.trackQA === undefined ? false : result.trackQA;
    
    if (!trackQA) {
      console.log("Q&A tracking is disabled in settings");
      return;
    }
    
    // Set up mutation observer to detect when new messages are added
    const conversationContainer = document.querySelector('main') || document;
    
    const conversationObserver = new MutationObserver((mutations) => {
      // Check if user just submitted a message (not through our extension)
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          const userMessages = document.querySelectorAll(CHATGPT_QUESTION_SELECTOR);
          
          if (userMessages.length > 0) {
            const latestMessage = userMessages[userMessages.length - 1];
            
            // Only track if it's a new message and we're not already waiting for an answer
            if (!isWaitingForAnswer) {
              const messageText = latestMessage.innerText.trim();
              
              // Make sure it's not our last recorded message
              if (messageText && messageText !== lastSubmittedQuestion) {
                // Start monitoring for the answer
                startAnswerMonitoring(messageText);
              }
            }
          }
        }
      }
    });
    
    // Start observing for new messages
    conversationObserver.observe(conversationContainer, {
      childList: true,
      subtree: true
    });
    
    console.log("Conversation observer started for ChatGPT");
  });
});

// Cleanup on page unload
window.addEventListener('unload', () => {
  if (pollingInterval) {
    clearInterval(pollingInterval);
  }
  
  if (answerObserver) {
    answerObserver.disconnect();
  }
});

// Add this to the content.js, near the beginning after detecting the platform
// Register this tab with the background script
function registerWithBackground() {
  const platform = getCurrentPlatform();
  if (!platform) return;
  
  const tabInfo = {
    title: document.title,
    url: window.location.href,
    favicon: getFaviconUrl()
  };
  
  chrome.runtime.sendMessage({
    action: "registerTab",
    platform: platform,
    tabInfo: tabInfo  // Include tab info during registration
  }, response => {
    if (response && response.success) {
      console.log(`Tab registered with background script, tabId: ${response.tabId}`);
    } else {
      console.error("Failed to register tab with background script");
    }
  });
}

// Call this function when the content script initializes
registerWithBackground();

// Add tab unregistration on page unload
window.addEventListener('unload', () => {
  chrome.runtime.sendMessage({
    action: "unregisterTab"
  });
  
  if (pollingInterval) {
    clearInterval(pollingInterval);
  }
  
  if (answerObserver) {
    answerObserver.disconnect();
  }
});


// Add these functions to content.js

// Function to send tab information to the background script
function sendTabInfo() {
  console.log("[DEBUG] sendTabInfo called with title:", document.title);
  console.log("[DEBUG] Current URL:", window.location.href);

  const tabInfo = {
    title: document.title,
    url: window.location.href,
    favicon: getFaviconUrl()
  };
  
  console.log("Sending tab info:", tabInfo);
  
  chrome.runtime.sendMessage({
    action: "updateTabInfo",
    data: tabInfo
  }, response => {
    if (response && response.success) {
      console.log("Tab info successfully sent");
    } else {
      console.log("Error sending tab info:", response?.error);
    }
  });
}

// Function to get favicon URL
function getFaviconUrl() {
  // Try standard favicon link
  const faviconLink = document.querySelector('link[rel="icon"]') || 
                       document.querySelector('link[rel="shortcut icon"]');
  if (faviconLink && faviconLink.href) {
    return faviconLink.href;
  }
  
  // Fallback to default favicon location
  return window.location.origin + "/favicon.ico";
}

// Set up tab info reporting
function setupTabInfoReporting() {
  // Send initial tab info
  sendTabInfo();
  
  // Setup periodic updates
  setInterval(sendTabInfo, 30000); // Every 30 seconds
  
  // Listen for title changes
  const titleObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList' || mutation.type === 'characterData') {
        sendTabInfo();
        break;
      }
    }
  });
  
  // Start observing title element if it exists
  const titleElement = document.querySelector('title');
  if (titleElement) {
    titleObserver.observe(titleElement, { 
      childList: true, 
      characterData: true, 
      subtree: true 
    });
  }
  
  // Also send updates when the URL changes
  let lastUrl = window.location.href;
  setInterval(() => {
    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      sendTabInfo();
    }
  }, 1000); // Check URL changes every second
}

// Call this function when the page is loaded
window.addEventListener('load', () => {
  // Wait a moment for everything to load properly
  setTimeout(setupTabInfoReporting, 1000);
});