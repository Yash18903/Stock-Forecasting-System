FROM python:3.9-slim

# Create a non-root user (Hugging Face Spaces requirement)
RUN useradd -m -u 1000 user
USER user
ENV PATH="/home/user/.local/bin:$PATH"

WORKDIR /app

# Copy requirements and install
COPY --chown=user:user requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# Copy all application files
COPY --chown=user:user . .

# Hugging face automatically sets PORT=7860. We expose it.
ENV PORT=7860
EXPOSE $PORT

CMD ["python", "app.py"]
