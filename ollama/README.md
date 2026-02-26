# Deploying Ollama to Hugging Face Spaces

This guide explains how to deploy the custom Ollama Docker image to Hugging Face Spaces.

## Prerequisites

- Hugging Face account
- This `Dockerfile`

## Steps

1. **Create a New Space**
   - Go to [Hugging Face Spaces](https://huggingface.co/spaces)
   - Click "Create new Space"
   - Name your space (e.g., `autonomous-agent-ollama`)
   - Select **Docker** as the SDK
   - Choose "Blank" template
   - Select "Public" or "Private" visibility (Private recommended)
   - Click "Create Space"

2. **Upload Dockerfile**
   - In your new Space, go to "Files" tab
   - Click "Add file" -> "Upload file"
   - Upload the `Dockerfile` from this directory
   - Commit changes

3. **Wait for Build**
   - The Space will automatically start building
   - Wait for the status to change from "Building" to "Running"
   - This may take a few minutes as it downloads the model

4. **Get Deployment URL**
   - Once running, click the "Embed this space" button (top right)
   - Copy the "Direct URL"
   - This URL will be used as `OLLAMA_URL` in your `.env` file
