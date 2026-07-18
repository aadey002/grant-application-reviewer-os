#!/usr/bin/env python3

import sys
import os

def extract_doc_content(doc_path, output_path):
    """Extract text content from a DOC file and save to text file."""
    try:
        # First try with docx2txt (works with both doc and docx)
        import docx2txt
        text = docx2txt.process(doc_path)
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(text)
        print(f"Successfully extracted content using docx2txt")
        return True
    except Exception as e:
        print(f"docx2txt failed: {e}")
    
    try:
        # Try with python-docx (mainly for docx files)
        from docx import Document
        doc = Document(doc_path)
        text = []
        for paragraph in doc.paragraphs:
            text.append(paragraph.text)
        
        content = '\n'.join(text)
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Successfully extracted content using python-docx")
        return True
    except Exception as e:
        print(f"python-docx failed: {e}")
    
    # If both fail, try to read as binary and look for text patterns
    try:
        with open(doc_path, 'rb') as f:
            content = f.read()
        
        # Try to decode as text (this is a very basic approach)
        text_content = content.decode('utf-8', errors='ignore')
        
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(text_content)
        print(f"Successfully extracted content using binary read (may contain noise)")
        return True
    except Exception as e:
        print(f"Binary read failed: {e}")
        return False

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python extract_doc.py <input_doc_path> <output_txt_path>")
        sys.exit(1)
    
    doc_path = sys.argv[1]
    output_path = sys.argv[2]
    
    if not os.path.exists(doc_path):
        print(f"Error: Input file '{doc_path}' does not exist")
        sys.exit(1)
    
    success = extract_doc_content(doc_path, output_path)
    if success:
        print(f"Content extracted and saved to: {output_path}")
    else:
        print("Failed to extract content from DOC file")
        sys.exit(1)
