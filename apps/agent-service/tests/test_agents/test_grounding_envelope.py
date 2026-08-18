import pytest

from src.agents.assistant.contracts import GroundingEnvelope
from src.agents.healthcare_graph import compose_healthcare_response
from src.agents.nodes.restaurant_node import compose_restaurant_response


@pytest.mark.parametrize("composer", [compose_restaurant_response, compose_healthcare_response])
def test_domain_graph_emits_valid_grounding_envelope(composer):
    result = composer({"status": "NEEDS_INPUT", "missing_slots": ["location"]})
    envelope = GroundingEnvelope.model_validate(result["grounding_envelope"])
    assert envelope.phase.value == "NEEDS_INFO"
    assert envelope.missing_information == ["location"]
    assert result["response"]


def test_domain_graph_preserves_empty_result_outcome():
    result = compose_restaurant_response({"status": "COMPLETED", "outcome": "EMPTY_RESULT"})
    envelope = GroundingEnvelope.model_validate(result["grounding_envelope"])
    assert envelope.outcome.value == "EMPTY_RESULT"
    assert result["response"]
