import sys
import os

# Add root folder to sys.path so it can import main.py directly
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import app
