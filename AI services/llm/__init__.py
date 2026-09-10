"""
LLM Intelligence and Natural Language Explanation Package.
Integrates Google Gemini and Groq with strict JSON schema enforcement,
factual grounding safeguards, and bulletproof cascading fallback.
"""

from llm.config import LLMConfig, get_default_llm_config
from llm.models import (
    ExplanationInput,
    StructuredPlanExplanation,
    PlanExplanationResponse
)
from llm.grounding import PromptGroundingEngine, GroundingValidationError
from llm.fallback import DeterministicExplanationEngine
from llm.providers.base import BaseLLMProvider
from llm.providers.gemini_provider import GeminiProvider
from llm.providers.groq_provider import GroqProvider
from llm.service import PlanExplanationService, get_plan_explanation_service

__all__ = [
    "LLMConfig",
    "get_default_llm_config",
    "ExplanationInput",
    "StructuredPlanExplanation",
    "PlanExplanationResponse",
    "PromptGroundingEngine",
    "GroundingValidationError",
    "DeterministicExplanationEngine",
    "BaseLLMProvider",
    "GeminiProvider",
    "GroqProvider",
    "PlanExplanationService",
    "get_plan_explanation_service"
]
