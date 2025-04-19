import TypeaheadOverlay from "./typeahead-overlay.js";
import {
  getAvailableModels,
  RECOMMENDED_MODELS,
} from "../utils/model-utils.js";
import { Box, Text, useInput } from "ink";
import React, { useEffect, useState } from "react";
import { log, isLoggingEnabled } from "../utils/agent/log.js";
import { NOVA_PRO_MODEL_ID } from "../utils/bedrock-agent.js";

/**
 * Props for <ModelOverlay>.
 *
 * When `hasLastResponse` is true the user has already received at least one
 * assistant response in the current session which means switching models is no
 * longer supported – the overlay should therefore show an error and only allow
 * the user to close it.
 */
type Props = {
  currentModel: string;
  hasLastResponse: boolean;
  onSelect: (model: string) => void;
  onExit: () => void;
};

export default function ModelOverlay({
  currentModel,
  hasLastResponse,
  onSelect,
  onExit,
}: Props): JSX.Element {
  const [items, setItems] = useState<Array<{ label: string; value: string }>>(
    [],
  );

  useEffect(() => {
    (async () => {
      const models = await getAvailableModels();

      // Split the list into recommended and "other" models.
      const recommended = RECOMMENDED_MODELS.filter((m) => models.includes(m));
      const others = models.filter((m) => !recommended.includes(m));

      const ordered = [...recommended, ...others.sort()];

      setItems(
        ordered.map((m) => ({
          label: recommended.includes(m) ? `⭐ ${m}` : m,
          value: m,
        })),
      );
    })();
  }, []);

  // Handle model selection with credential reminder for Bedrock models
  const handleModelSelect = (model: string) => {
    if (model.includes('amazon.') || model === NOVA_PRO_MODEL_ID) {
      if (isLoggingEnabled()) {
        log(`[model] User selected Amazon Bedrock model: ${model}`);
        log(`[model] Reminder: AWS credentials must be properly configured for Bedrock models`);
      }
      
      // Display a message for the UI as well (this appears in the console)
      console.warn('⚠️  Amazon Bedrock model selected. Make sure AWS credentials are properly configured.');
      console.warn('   Set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_REGION environment variables.');
    }
    
    // Call the original onSelect handler
    onSelect(model);
  };

  // ---------------------------------------------------------------------------
  // If the conversation already contains a response we cannot change the model
  // anymore because the backend requires a consistent model across the entire
  // run.  In that scenario we replace the regular typeahead picker with a
  // simple message instructing the user to start a new chat.  The only
  // available action is to dismiss the overlay (Esc or Enter).
  // ---------------------------------------------------------------------------

  // Always register input handling so hooks are called consistently.
  useInput((_input, key) => {
    if (hasLastResponse && (key.escape || key.return)) {
      onExit();
    }
  });

  if (hasLastResponse) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="gray"
        width={80}
      >
        <Box paddingX={1}>
          <Text bold color="red">
            Unable to switch model
          </Text>
        </Box>
        <Box paddingX={1}>
          <Text>
            You can only pick a model before the assistant sends its first
            response. To use a different model please start a new chat.
          </Text>
        </Box>
        <Box paddingX={1}>
          <Text dimColor>press esc or enter to close</Text>
        </Box>
      </Box>
    );
  }

  return (
    <TypeaheadOverlay
      title="Switch model"
      description={
        <Text>
          Current model: <Text color="greenBright">{currentModel}</Text>
        </Text>
      }
      initialItems={items}
      currentValue={currentModel}
      onSelect={handleModelSelect}
      onExit={onExit}
    />
  );
}
