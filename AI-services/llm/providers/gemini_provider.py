from typing import Optional
from llm.models import ExplanationInput, StructuredPlanExplanation
from llm.config import LLMConfig
from llm.providers.base import BaseLLMProvider
from llm.grounding import PromptGroundingEngine, GroundingValidationError
from utils.logger import get_logger

logger = get_logger("gemini_provider")


class GeminiProvider(BaseLLMProvider):
    """
    Google Gemini LLM provider using the official google-genai SDK.
    Serves as the primary explanation provider for the Railway block planning system.
    """

    def __init__(self, config: Optional[LLMConfig] = None):
        super().__init__(config or LLMConfig())
        self._client = None
        self._init_client()

    def _init_client(self):
        """Initializes the official google-genai client if API key is present."""
        if not self.config.has_gemini_key():
            return
        try:
            from google import genai
            self._client = genai.Client(api_key=self.config.gemini_api_key)
        except Exception as e:
            logger.warning("Failed to initialize Google GenAI client: %s", str(e))
            self._client = None

    @property
    def provider_name(self) -> str:
        return "gemini"

    @property
    def model_name(self) -> str:
        return self.config.gemini_model

    def is_available(self) -> bool:
        return self.config.has_gemini_key() and self._client is not None

    def explain_plan(self, input_data: ExplanationInput) -> StructuredPlanExplanation:
        """
        Executes Gemini call with system instructions and JSON schema enforcement,
        then validates the response through PromptGroundingEngine.
        """
        if not self.is_available():
            raise RuntimeError("Gemini provider is not available (missing API key or client initialization failed).")

        from google.genai import types

        user_prompt = PromptGroundingEngine.build_user_prompt(input_data)
        logger.info("Calling Gemini (%s) for plan: %s", self.model_name, input_data.selected_plan)

        try:
            response = self._client.models.generate_content(
                model=self.model_name,
                contents=user_prompt,
                config=types.GenerateContentConfig(
                    system_instruction=PromptGroundingEngine.SYSTEM_INSTRUCTION,
                    temperature=0.2,
                    response_mime_type="application/json"
                )
            )

            if not response or not response.text:
                raise GroundingValidationError("Empty response received from Gemini.")

            return PromptGroundingEngine.validate_and_parse(response.text, input_data)

        except GroundingValidationError:
            raise
        except Exception as e:
            logger.error("Gemini API error: %s", str(e))
            raise RuntimeError(f"Gemini generation failure: {str(e)}") from e
