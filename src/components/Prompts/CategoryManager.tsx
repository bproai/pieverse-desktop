// src/components/Prompts/CategoryManager.tsx
import React, { useState } from 'react';
import { 
  Modal, 
  Group, 
  Button, 
  Stack, 
  Card, 
  Text, 
  Badge, 
  TextInput, 
  ActionIcon,
  Divider,
  ThemeIcon
} from '@mantine/core';
import { Pencil, Trash, Book, ChartBar, Code, ArrowUp, ArrowDown } from 'lucide-react';
import type { Prompt } from '../../services/MySQLPromptService';

interface CategoryManagerProps {
  isOpen: boolean;
  onClose: () => void;
  categories: string[];
  promptsByCategory: Record<string, Prompt[]>;
  onAddCategory: (categoryName: string) => void;
  onUpdateCategory: (index: number, newName: string) => void;
  onDeleteCategory: (categoryName: string) => void;
  getCategoryIcon: (categoryName: string) => any;
  onReorderCategories?: (categories: string[]) => void;
}

const CategoryManager: React.FC<CategoryManagerProps> = ({
  isOpen,
  onClose,
  categories,
  promptsByCategory,
  onAddCategory,
  onUpdateCategory,
  onDeleteCategory,
  getCategoryIcon,
  onReorderCategories
}) => {
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategory, setEditingCategory] = useState<{index: number, name: string} | null>(null);
  const [categoryToDelete, setCategoryToDelete] = useState<string | null>(null);

  const handleAddCategory = () => {
    if (newCategoryName.trim() === '') return;
    onAddCategory(newCategoryName.trim());
    setNewCategoryName('');
  };

  const handleUpdateCategory = () => {
    if (!editingCategory || editingCategory.name.trim() === '') return;
    if (editingCategory.index < 0 || editingCategory.index >= categories.length) return;
    
    onUpdateCategory(editingCategory.index, editingCategory.name.trim());
    setEditingCategory(null);
  };

  // Move a category up in the list
  const handleMoveUp = (index: number) => {
    if (index <= 0) return; // Can't move the first item up
    
    const newCategories = [...categories];
    // Swap with previous item
    [newCategories[index], newCategories[index - 1]] = [newCategories[index - 1], newCategories[index]];
    
    if (onReorderCategories) {
      onReorderCategories(newCategories);
    }
  };

  // Move a category down in the list
  const handleMoveDown = (index: number) => {
    if (index >= categories.length - 1) return; // Can't move the last item down
    
    const newCategories = [...categories];
    // Swap with next item
    [newCategories[index], newCategories[index + 1]] = [newCategories[index + 1], newCategories[index]];
    
    if (onReorderCategories) {
      onReorderCategories(newCategories);
    }
  };

  // Render the category icon based on the configuration
  const renderCategoryIcon = (categoryName: string) => {
    const iconConfig = getCategoryIcon(categoryName);
    
    if (iconConfig.type === 'icon') {
      // Render predefined icons
      if (iconConfig.name === 'book') {
        return (
          <ThemeIcon size="sm" color={iconConfig.color} variant="light">
            <Book size={14} />
          </ThemeIcon>
        );
      } else if (iconConfig.name === 'chart-bar') {
        return (
          <ThemeIcon size="sm" color={iconConfig.color} variant="light">
            <ChartBar size={14} />
          </ThemeIcon>
        );
      } else if (iconConfig.name === 'code') {
        return (
          <ThemeIcon size="sm" color={iconConfig.color} variant="light">
            <Code size={14} />
          </ThemeIcon>
        );
      }
    } else if (iconConfig.type === 'letter') {
      // Render letter icon for custom categories
      return (
        <div className="w-5 h-5 rounded-full bg-gray-300 flex items-center justify-center text-xs font-bold">
          {iconConfig.letter}
        </div>
      );
    }
    
    return null;
  };

  return (
    <Modal
      opened={isOpen}
      onClose={() => {
        onClose();
        setNewCategoryName('');
        setEditingCategory(null);
        setCategoryToDelete(null);
      }}
      title="Manage Categories"
      size="lg"
    >
      <Stack spacing="md">
        {/* Add New Category */}
        <Card withBorder p="md">
          <Text weight={600} mb="md">Add New Category</Text>
          <Group position="apart">
            <TextInput
              placeholder="New category name"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              style={{ flexGrow: 1 }}
            />
            <Button 
              onClick={handleAddCategory}
              disabled={!newCategoryName.trim()}
            >
              Add
            </Button>
          </Group>
        </Card>
        
        {/* Existing Categories */}
        <Card withBorder p="md">
          <Text weight={600} mb="md">Existing Categories</Text>
          <Stack spacing="xs">
            {categories.map((category, index) => (
              <Group key={index} position="apart" className="border-b pb-2">
                <Group>
                  {renderCategoryIcon(category)}
                  <Text>{category}</Text>
                  <Badge size="sm" color="blue">
                    {promptsByCategory[category]?.length || 0} prompts
                  </Badge>
                </Group>
                <Group spacing="xs">
                  {/* Up/Down Buttons for Reordering */}
                  <ActionIcon
                    color="blue"
                    onClick={() => handleMoveUp(index)}
                    disabled={index === 0}
                    title="Move category up"
                  >
                    <ArrowUp size={16} />
                  </ActionIcon>
                  <ActionIcon
                    color="blue"
                    onClick={() => handleMoveDown(index)}
                    disabled={index === categories.length - 1}
                    title="Move category down"
                  >
                    <ArrowDown size={16} />
                  </ActionIcon>
                  
                  {/* Edit Button */}
                  <ActionIcon 
                    color="blue"
                    onClick={() => setEditingCategory({ index, name: category })}
                  >
                    <Pencil size={16} />
                  </ActionIcon>
                  
                  {/* Delete Button */}
                  <ActionIcon 
                    color="red"
                    onClick={() => setCategoryToDelete(category)}
                    disabled={categories.length <= 1}
                    title={categories.length <= 1 ? "Cannot delete the last category" : "Delete category"}
                  >
                    <Trash size={16} />
                  </ActionIcon>
                </Group>
              </Group>
            ))}
            
            {categories.length === 0 && (
              <Text align="center" color="dimmed" italic>No categories added yet</Text>
            )}
          </Stack>
        </Card>
        
        {/* Edit Category Input (conditionally shown) */}
        {editingCategory && (
          <Card withBorder p="md">
            <Text weight={600} mb="md">Edit Category</Text>
            <Group position="apart">
              <TextInput
                placeholder="Category name"
                value={editingCategory.name}
                onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
                style={{ flexGrow: 1 }}
              />
              <Group spacing="xs">
                <Button 
                  variant="subtle"
                  onClick={() => setEditingCategory(null)}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleUpdateCategory}
                  disabled={!editingCategory.name.trim()}
                >
                  Update
                </Button>
              </Group>
            </Group>
          </Card>
        )}
        
        {/* Delete Category Confirmation */}
        <Modal
          opened={!!categoryToDelete}
          onClose={() => setCategoryToDelete(null)}
          title="Delete Category"
          size="sm"
        >
          <Stack spacing="md">
            <Text>
              Are you sure you want to delete the category "{categoryToDelete}"?
              {promptsByCategory[categoryToDelete || '']?.length > 0 && (
                <Text color="red" weight={600} mt="xs">
                  Warning: This will also delete {promptsByCategory[categoryToDelete || '']?.length} prompts in this category.
                </Text>
              )}
            </Text>
            <Group position="right">
              <Button variant="subtle" onClick={() => setCategoryToDelete(null)}>
                Cancel
              </Button>
              <Button 
                color="red"
                onClick={() => {
                  onDeleteCategory(categoryToDelete || '');
                  setCategoryToDelete(null);
                }}
              >
                Delete
              </Button>
            </Group>
          </Stack>
        </Modal>
        
        <Divider />
        
        <Group position="right">
          <Button onClick={onClose}>
            Close
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};

export default CategoryManager;