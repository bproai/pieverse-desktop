// src/components/Prompts/categoryHooks.ts
import { useState, useEffect } from 'react';
import { notifications } from '@mantine/notifications';
import type { Prompt } from '../../services/MySQLPromptService';
import SQLitePromptService from '../../services/SQLitePromptService';
import promptService from '../../services/MySQLPromptService';

// Default categories
const DEFAULT_CATEGORIES = ['WRITING & ANALYSIS', 'FINANCE & MARKETS', 'CODE & DEVELOPMENT'];
const STORAGE_KEY = 'pieverse-prompt-categories';

// Define a type for category icons
type CategoryIcon = {
  type: 'icon' | 'letter';
  name?: string; // Icon name for predefined icons
  letter?: string; // First letter for custom categories
  color: string;
};

export const useCategories = (prompts: Prompt[], setPrompts: React.Dispatch<React.SetStateAction<Prompt[]>>, backend: string) => {
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  
  // Get the active service based on backend selection
  const activeService = backend === 'sqlite' ? SQLitePromptService : promptService;

  // Load categories from localStorage on mount
  useEffect(() => {
    const savedCategories = localStorage.getItem(STORAGE_KEY);
    if (savedCategories) {
      try {
        const parsedCategories = JSON.parse(savedCategories);
        if (Array.isArray(parsedCategories) && parsedCategories.length > 0) {
          setCategories(parsedCategories);
        }
      } catch (error) {
        console.error('Error loading categories:', error);
      }
    }
  }, []);

  // Save categories to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(categories));
    } catch (error) {
      console.error('Error saving categories:', error);
    }
  }, [categories]);

  // Add a new category
  const addCategory = (categoryName: string) => {
    if (categoryName.trim() === '') return;
    if (categories.includes(categoryName.trim())) {
      notifications.show({
        title: 'Error',
        message: 'Category already exists',
        color: 'red'
      });
      return;
    }
    
    setCategories(prev => [...prev, categoryName.trim()]);
    notifications.show({
      title: 'Success',
      message: 'Category added successfully',
      color: 'green'
    });
  };

  // Update a category
  const updateCategory = async (index: number, newName: string) => {
    if (newName.trim() === '') return;
    if (index < 0 || index >= categories.length) return;
    
    if (categories.includes(newName.trim()) && 
        categories[index] !== newName.trim()) {
      notifications.show({
        title: 'Error',
        message: 'Category already exists',
        color: 'red'
      });
      return;
    }
    
    const oldCategoryName = categories[index];
    const updatedCategoryName = newName.trim();
    
    // Update category in the list
    const updatedCategories = [...categories];
    updatedCategories[index] = updatedCategoryName;
    setCategories(updatedCategories);
    
    // Update category for all prompts using this category
    const updatedPrompts = prompts.map(prompt => {
      if (prompt.category === oldCategoryName) {
        return { ...prompt, category: updatedCategoryName };
      }
      return prompt;
    });
    
    // Update prompts in the database
    for (const prompt of updatedPrompts) {
      if (prompt.category === updatedCategoryName && prompt.id) {
        try {
          await activeService.updatePrompt(prompt.id, prompt);
        } catch (error) {
          console.error('Failed to update prompt category:', error);
        }
      }
    }
    
    setPrompts(updatedPrompts);
    
    notifications.show({
      title: 'Success',
      message: 'Category updated successfully',
      color: 'green'
    });
  };

  // Delete a category
  const deleteCategory = async (categoryName: string) => {
    if (!categoryName || !categories.includes(categoryName)) return;
    
    // Check if there are prompts using this category
    const promptsUsingCategory = prompts.filter(prompt => prompt.category === categoryName);
    
    if (promptsUsingCategory.length > 0) {
      // Delete all prompts in this category
      try {
        for (const prompt of promptsUsingCategory) {
          await activeService.deletePrompt(prompt.id);
        }
        
        // Update local prompts state
        setPrompts(prompts.filter(prompt => prompt.category !== categoryName));
      } catch (error) {
        console.error('Failed to delete prompts in category:', error);
        notifications.show({
          title: 'Error',
          message: 'Failed to delete prompts in category',
          color: 'red'
        });
        return;
      }
    }
    
    // Remove the category from the list
    setCategories(categories.filter(cat => cat !== categoryName));
    
    notifications.show({
      title: 'Success',
      message: 'Category deleted successfully',
      color: 'green'
    });
  };

  // Reorder categories
  const reorderCategories = (newCategoriesOrder: string[]) => {
    // Validate the new order contains all existing categories
    if (newCategoriesOrder.length !== categories.length || 
        !categories.every(cat => newCategoriesOrder.includes(cat))) {
      console.error('Invalid category reordering: categories list mismatch');
      return;
    }
    
    setCategories(newCategoriesOrder);
    
    notifications.show({
      title: 'Success',
      message: 'Categories reordered successfully',
      color: 'green'
    });
  };

  // Get icon configuration for a category (no JSX)
  const getCategoryIcon = (categoryName: string): CategoryIcon => {
    // Default icons for the original categories
    if (categoryName === 'WRITING & ANALYSIS') {
      return { type: 'icon', name: 'book', color: 'blue' };
    }
    if (categoryName === 'FINANCE & MARKETS') {
      return { type: 'icon', name: 'chart-bar', color: 'green' };
    }
    if (categoryName === 'CODE & DEVELOPMENT') {
      return { type: 'icon', name: 'code', color: 'purple' };
    }
    
    // For custom categories, use the first letter
    const firstChar = categoryName.charAt(0).toUpperCase();
    return { type: 'letter', letter: firstChar, color: 'gray' };
  };


  // Add this function inside the useCategories hook, before the return statement
  const reconcileCategories = (promptCategories: string[]) => {
    // Find categories that exist in prompts but not in our list
    const missingCategories = promptCategories.filter(
      cat => cat && !categories.includes(cat)
    );
    
    // If we found new categories, add them to our list
    if (missingCategories.length > 0) {
      setCategories(prev => [...prev, ...missingCategories]);
    }
  };

  return {
    categories,
    addCategory,
    updateCategory,
    deleteCategory,
    reorderCategories,
    getCategoryIcon,
    reconcileCategories
  };
};

