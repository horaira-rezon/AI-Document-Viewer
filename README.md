# DocuLens - Document Analyzer & Visual Study Assistant

A lightweight, standalone single-file web application for multi-document reading, freehand visual region marking, multi-document analysis, and AI vector diagram rendering with Google Gemini.

## Features

- **Direct Standalone Run**: Open `index.html` directly in any web browser.
- **Multi-Document Upload (Up to 10 files)**: Supports PDF, DOCX, PPTX, Images (PNG, JPG, WEBP, GIF), and text files.
- **Freehand Region Marker Tool**: Circle any formula, diagram, or paragraph on the page to crop and query Gemini specifically about that visual area.
- **Direct Gemini Streaming**: Real-time streaming responses directly from Google Gemini (`gemini-2.5-flash`, `gemini-1.5-flash`, etc.).
- **Vector Diagrams**: Automatically renders Mermaid.js flowcharts, mindmaps, and sequence diagrams inline.
- **Reading Simplicity Dial**: Switch between **Simple (ELI5)**, **Standard**, and **Technical** explanations.

## Quick Start

1. Open `index.html` in your browser (double click or serve with any simple server).
2. Click the **API Key** button in the top-right corner to enter your free Google Gemini API Key (saved in browser `localStorage`).
3. Drag & drop or upload your study documents and start asking questions!
