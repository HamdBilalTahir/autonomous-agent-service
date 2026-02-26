FROM ollama/ollama:latest

# Remove default entrypoint
ENTRYPOINT []

ENV OLLAMA_HOST=0.0.0.0:7860
ENV OLLAMA_MODELS=/root/.ollama/models

EXPOSE 7860

CMD sh -c "\
    ollama serve & \
    sleep 15 && \
    echo 'Pulling model...' && \
    ollama pull codegemma:2b && \
    echo 'Ready.' && \
    wait"


# FROM ollama/ollama:latest

# ENV OLLAMA_HOST=0.0.0.0:7860
# ENV PORT=7860

# # Start ollama in background and pull the model
# RUN ollama serve & \
#     sleep 5 && \
#     ollama pull deepseek-coder:6.7b

# EXPOSE 7860

# CMD ["ollama", "serve"]
