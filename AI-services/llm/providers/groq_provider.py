from typing import Optional
from llm.models import ExplanationInput, StructuredPlanExplanation
from llm.config import LLMConfig
from llm.providers.base import BaseLLMProvider
from llm.grounding import PromptGroundingEngine, GroundingValidationError
from utils.logger import get_logger

logger = get_logger("groq_provider")


class GroqProvider(BaseLLMProvider):
    """
    Groq LLM provider using the official groq SDK.
    Serves as the ultra-fast secondary/fallback provider for block plan explanations.
    """

    def __init__(self, config: Optional[LLMConfig] = None):
        super().__init__(config or LLMConfig())
        self._client = None
        self._init_client()

    def _init_client(self):
        """Initializes the Groq client if API key is present."""
        if not self.config.has_groq_key():
            return
        try:
            from groq import Groq
            self._client = Groq(
                api_key=self.config.groq_api_key,
                timeout=self.config.timeout_seconds
            )
        except Exception as e:
            logger.warning("Failed to initialize Groq client: %s", str(e))
            self._client = None

    @property
    def provider_name(self) -> str:
        return "groq"

    @property
    def model_name(self) -> str:
        return self.config.groq_model

    def is_available(self) -> bool:
        return self.config.has_groq_key() and self._client is not None

    def explain_plan(self, input_data: ExplanationInput) -> StructuredPlanExplanation:
        """
        Executes Groq completion with JSON mode and system instructions,
        then validates the response through PromptGroundingEngine.
        """
        if not self.is_available():
            raise RuntimeError("Groq provider is not available (missing API key or client initialization failed).")

        user_prompt = PromptGroundingEngine.build_user_prompt(input_data)
        logger.info("Calling Groq (%s) for plan: %s", self.model_name, input_data.selected_plan)

        try:
            chat_completion = self._client.chat.completions.create(
                messages=[
                    {"role": "system", "content": PromptGroundingEngine.SYSTEM_INSTRUCTION},
                    {"role": "user", "content": user_prompt}
                ],
                model=self.model_name,
                temperature=0.2,
                response_format={"type": "json_object"}
            )

            if not chat_completion.choices or not chat_completion.choices[0].message.content:
                raise GroundingValidationError("Empty response received from Groq.")

            content = chat_completion.choices[0].message.content
            return PromptGroundingEngine.validate_and_parse(content, input_data)

        except GroundingValidationError:
            raise
        except Exception as e:
            logger.error("Groq API error: %s", str(e))
            raise RuntimeError(f"Groq generation failure: {str(e)}") from e
