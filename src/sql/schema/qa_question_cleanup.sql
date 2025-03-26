-- 1. Drop the backup table if it already exists
DROP TABLE IF EXISTS qa_questions_backup;

-- 2. Create a fresh backup of your table
CREATE TABLE qa_questions_backup AS SELECT * FROM qa_questions;

-- 3. Delete duplicates using ROW_NUMBER() window function
DELETE FROM qa_questions 
WHERE id IN (
  WITH ordered_questions AS (
    SELECT 
      id,
      platform, 
      question,
      answered,
      timestamp,
      ROW_NUMBER() OVER (
        PARTITION BY platform, question 
        ORDER BY 
          answered DESC, -- Keep answered=1 records first
          timestamp DESC  -- For same answered status, keep newest
      ) as row_num
    FROM qa_questions
  )
  SELECT id FROM ordered_questions
  WHERE row_num > 1
);

-- 4. Clean up any orphaned answers
DELETE FROM qa_answers 
WHERE question_id NOT IN (
  SELECT id FROM qa_questions
);

-- 5. Create an index to improve future performance
CREATE INDEX IF NOT EXISTS idx_qa_questions_platform_question 
ON qa_questions(platform, question);