from abc import ABC, abstractmethod
from typing import Optional
from llm.models import ExplanationInput, StructuredPlanExplanation
from llm.config import LLMConfig


class BaseLLMProvider(ABC):
    """
    Abstract interface for LLM intelligence providers (Gemini, Groq, etc.).
    Ensures modularity and strict decoupling from vendor-specific implementations.
    """

    def __init__(self, config: LLMConfig):
        self.config = config

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Unique provider identifier (e.g. 'gemini', 'groq')."""
        pass

    @property
    @abstractmethod
    def model_name(self) -> str:
        """Name of the model utilized by this provider."""
        pass

    @abstractmethod
    def is_available(self) -> bool:
        """Checks if required API keys and client libraries are present."""
        pass

    @abstractmethod
    def explain_plan(self, input_data: ExplanationInput) -> StructuredPlanExplanation:
        """
        Generates a factually grounded structured plan explanation.
        Raises an exception on network failure, timeout, or schema contradiction.
        """
        pass
