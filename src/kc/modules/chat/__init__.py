"""Chat conversations, BYOK isolation, query rewriting, citation validation, and agent orchestration."""
from src.kc.modules.chat.agent import MAX_TOOL_CALLS_PER_TURN, run_agentic_turn, stream_agentic_turn
from src.kc.modules.chat.byok import (
    ALLOWED_LLM_HOSTS,
    BYOKConfigurationError,
    get_turn_llm_client,
    resolve_model_name,
    validate_llm_base_url,
)
from src.kc.modules.chat.citations import validate_and_build_citations
from src.kc.modules.chat.conversations import (
    compute_source_scope,
    create_conversation,
    delete_conversation,
    get_accessible_conversation,
    get_conversation_detail,
    list_conversations,
    record_message_sources,
    set_conversation_excluded_sources,
    update_conversation,
    verify_project_membership,
)
from src.kc.modules.chat.rewrite import rewrite_followup_query

__all__ = [
    "ALLOWED_LLM_HOSTS",
    "BYOKConfigurationError",
    "MAX_TOOL_CALLS_PER_TURN",
    "compute_source_scope",
    "create_conversation",
    "delete_conversation",
    "get_accessible_conversation",
    "get_conversation_detail",
    "get_turn_llm_client",
    "list_conversations",
    "record_message_sources",
    "resolve_model_name",
    "rewrite_followup_query",
    "run_agentic_turn",
    "set_conversation_excluded_sources",
    "stream_agentic_turn",
    "update_conversation",
    "validate_and_build_citations",
    "validate_llm_base_url",
    "verify_project_membership",
]
