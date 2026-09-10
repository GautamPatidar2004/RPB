import re
import json
from typing import Dict, Any, Optional
from llm.models import ExplanationInput, StructuredPlanExplanation
from utils.logger import get_logger

logger = get_logger("llm_grounding")


class GroundingValidationError(ValueError):
    """Raised when an LLM output contradicts ground truth planning data or violates schema."""
    pass


class PromptGroundingEngine:
    """
    Constructs factually grounded prompts, sanitizes user inputs,
    and rigorously verifies LLM output against verified optimization metrics.
    """

    SYSTEM_INSTRUCTION = (
        "You are the Indian Railways AI Chief Planning Officer and Operations Analyst.\n"
        "Your task is to generate an executive, technical explanation of an already-selected, "
        "mathematically optimized railway block plan.\n"
        "\n"
        "CRITICAL RULES:\n"
        "1. Ground all explanations ONLY in the provided ground-truth data.\n"
        "2. DO NOT recalculate or modify the plan, schedule, or metrics.\n"
        "3. DO NOT invent fictitious train numbers, stations, or non-existent constraints.\n"
        "4. DO NOT make vague claims like 'AI selected this'. Cite specific numeric metrics.\n"
        "5. If information is missing or not provided, explicitly state that it was not provided.\n"
        "6. Return ONLY a valid JSON object strictly conforming to the requested schema.\n"
    )

    @classmethod
    def sanitize_input_text(cls, text: Optional[str]) -> str:
        """Sanitizes user queries to prevent prompt injection or delimiter breaking."""
        if not text:
            return ""
        # Remove control characters and potential injection phrases
        sanitized = re.sub(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]", "", text)
        sanitized = re.sub(r"(ignore previous instructions|system prompt|override)", "[filtered]", sanitized, flags=re.IGNORECASE)
        return sanitized.strip()[:500]  # limit length

    @classmethod
    def build_user_prompt(cls, data: ExplanationInput) -> str:
        """Formats ground-truth plan data into a structured prompt."""
        clean_query = cls.sanitize_input_text(data.user_query)

        prompt_dict = {
            "instruction": "Explain the selected block plan and its trade-offs using the data below.",
            "selected_plan": {
                "plan_reference": data.selected_plan,
                "strategy": data.strategy,
                "composite_score": data.score,
                "corridor": data.corridor_code
            },
            "metrics": data.metrics,
            "key_decisions": data.key_decisions,
            "tradeoffs_vs_alternatives": data.tradeoffs,
            "scheduled_priority_tasks": data.scheduled_priority_tasks,
            "unscheduled_priority_tasks": data.unscheduled_priority_tasks,
            "verified_constraints": data.major_constraints,
            "alternatives_evaluated": data.alternatives,
            "dispatcher_query": clean_query if clean_query else None
        }

        schema_format = (
            "{\n"
            '  "summary": "string",\n'
            '  "selected_plan_reason": "string",\n'
            '  "key_decisions": ["string"],\n'
            '  "operational_impact": "string",\n'
            '  "asset_availability_impact": "string",\n'
            '  "priority_maintenance": ["string"],\n'
            '  "unscheduled_tasks": ["string"],\n'
            '  "tradeoffs": [{"dimension": "string", "summary": "string"}],\n'
            '  "alternatives": [{"plan_reference": "string", "strategy": "string", "why_not_selected": "string"}],\n'
            '  "warnings": ["string"]\n'
            "}"
        )

        return (
            f"Ground-Truth Block Planning Data:\n"
            f"```json\n{json.dumps(prompt_dict, indent=2)}\n```\n\n"
            f"Emit ONLY a valid JSON object following this exact schema:\n"
            f"```json\n{schema_format}\n```"
        )

    @classmethod
    def extract_json_from_llm_response(cls, response_text: str) -> Dict[str, Any]:
        """Extracts JSON object from markdown code fences or raw text safely."""
        text = response_text.strip()
        # Check for ```json ... ``` markdown block
        match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
        if match:
            text = match.group(1)
        else:
            # Look for outermost curly braces
            start = text.find("{")
            end = text.rfind("}")
            if start != -1 and end != -1 and end > start:
                text = text[start:end + 1]

        try:
            return json.loads(text)
        except Exception as e:
            raise GroundingValidationError(f"Malformed JSON in LLM response: {str(e)}")

    @classmethod
    def validate_and_parse(
        cls,
        response_text: str,
        expected_input: ExplanationInput
    ) -> StructuredPlanExplanation:
        """
        Parses and validates LLM output against the Pydantic schema and ground-truth invariants.
        Raises GroundingValidationError if any hallucination or contradiction is detected.
        """
        raw_json = cls.extract_json_from_llm_response(response_text)

        # Validate schema via Pydantic
        try:
            explanation = StructuredPlanExplanation(**raw_json)
        except Exception as e:
            raise GroundingValidationError(f"LLM response failed schema validation: {str(e)}")

        # Factual Grounding Checks:
        # 1. Summary and selected_plan_reason must not be empty or generic placeholders
        if len(explanation.summary.strip()) < 15:
            raise GroundingValidationError("Summary too short or incomplete.")

        if len(explanation.selected_plan_reason.strip()) < 15:
            raise GroundingValidationError("Selected plan reasoning too short or incomplete.")

        # 2. Check for vague AI claims
        forbidden_phrases = ["as an ai", "ai selected", "i cannot determine", "as a language model"]
        for phrase in forbidden_phrases:
            if phrase in explanation.selected_plan_reason.lower() or phrase in explanation.summary.lower():
                raise GroundingValidationError(f"Forbidden vague AI phrase detected: '{phrase}'")

        return explanation
