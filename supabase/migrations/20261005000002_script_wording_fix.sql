-- Grammar fix in a base AI Video script ("your property first line" -> "your property's first line").
UPDATE script_templates
SET script_content = REPLACE(script_content, 'your property first line of defense', 'your property''s first line of defense')
WHERE script_content LIKE '%your property first line of defense%';
