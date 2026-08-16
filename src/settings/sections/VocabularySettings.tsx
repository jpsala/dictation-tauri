import { PersonalVocabularySettings } from "../../personal-vocabulary/PersonalVocabularySettings";
import type { VocabularySettingsProps } from "../section-contracts";

export function VocabularySettings({ vocabularyClient }: VocabularySettingsProps) {
  return (
    <>
      <section id="settings-vocabulary-rules" aria-label="Vocabulario personal">
        <PersonalVocabularySettings client={vocabularyClient} />
      </section>
    </>
  );
}
