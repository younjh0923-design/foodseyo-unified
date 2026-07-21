"use client";

import React, { useMemo, useState } from "react";

const STATE_LABELS = {
  candidate: "Candidates",
  conflicting: "Conflicting clues",
  rejected: "No candidates",
  user_confirmed: "Confirmed",
};

const EMPTY_CALLBACK = () => {};

export function RestaurantConfirmationPanel({
  screen,
  selectedCandidateId = null,
  submissionState = "idle",
  statusMessage = "",
  onSelect = EMPTY_CALLBACK,
  onConfirm = EMPTY_CALLBACK,
  onRetry = EMPTY_CALLBACK,
  onMenuOnly = EMPTY_CALLBACK,
  onContinue = EMPTY_CALLBACK,
}) {
  const isSubmitting = submissionState === "loading";
  const isError = submissionState === "error";
  const canChoose = screen.candidates.some((candidate) => candidate.canSelect);
  const selectedCandidate = screen.candidates.find(
    (candidate) => candidate.candidateId === selectedCandidateId,
  );

  return (
    <main
      className="shell confirmation-shell"
      aria-labelledby="confirmation-title"
      aria-busy={isSubmitting}
    >
      <div className="fixture-banner" role="note">
        <strong>Fixture preview</strong>
        <span>
          Server confirmation is not connected until PR #27 merges. Actions on
          this page stay in your browser.
        </span>
      </div>

      <header className="page-header">
        <p className="eyebrow">Restaurant check</p>
        <h1 id="confirmation-title">{screen.title}</h1>
        <p className="lede">{screen.description}</p>
      </header>

      {screen.candidates.length > 0 ? (
        <section aria-labelledby="candidate-heading">
          <div className="section-heading">
            <h2 id="candidate-heading">Which restaurant is yours?</h2>
            {canChoose ? <span>Choose one</span> : null}
          </div>
          <div className="candidate-list">
            {screen.candidates.map((candidate) => {
              const isSelected = candidate.candidateId === selectedCandidateId;
              return (
                <button
                  className={`candidate-card${isSelected ? " is-selected" : ""}`}
                  type="button"
                  key={candidate.candidateId}
                  aria-pressed={isSelected}
                  aria-label={candidate.confirmAriaLabel ?? candidate.name}
                  disabled={!candidate.canSelect || isSubmitting}
                  onClick={() => onSelect(candidate.candidateId)}
                >
                  <span className="candidate-rank">Option {candidate.rank}</span>
                  <span className="candidate-name">{candidate.name}</span>
                  <span className="candidate-address">{candidate.address}</span>
                  <span className="reason-list" aria-label="Why this matches">
                    {candidate.matchReasons.map((reason) => (
                      <span className="reason-chip" key={reason}>
                        {reason}
                      </span>
                    ))}
                  </span>
                  <span className="selection-mark" aria-hidden="true">
                    {isSelected ? "Selected" : "Select"}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ) : (
        <section className="empty-state" aria-labelledby="empty-heading">
          <p className="empty-icon" aria-hidden="true">?</p>
          <h2 id="empty-heading">No restaurant candidates matched</h2>
          <p>Your menu photos are still available for menu-only analysis.</p>
        </section>
      )}

      <div
        className={`status-message${isError ? " is-error" : ""}`}
        role={isError ? "alert" : "status"}
        aria-live={isError ? "assertive" : "polite"}
      >
        {isSubmitting ? "Saving your fixture choice…" : statusMessage}
      </div>

      <div className="action-stack">
        {canChoose ? (
          <button
            className="primary-button"
            type="button"
            disabled={!selectedCandidate || isSubmitting}
            onClick={() => onConfirm(selectedCandidate?.candidateId ?? null)}
          >
            {isSubmitting ? "Saving choice…" : "Yes, this is the restaurant"}
          </button>
        ) : null}

        {screen.controls.some(
          (control) => control.id === "retry-restaurant-matching",
        ) ? (
          <button className="secondary-button" type="button" onClick={onRetry}>
            Try restaurant matching again
          </button>
        ) : null}

        {screen.controls.some((control) => control.id === "continue-analysis") ? (
          <button className="primary-button" type="button" onClick={onContinue}>
            Continue to menu analysis
          </button>
        ) : null}

        {screen.controls.some(
          (control) => control.id === "continue-menu-only",
        ) ? (
          <button className="text-button" type="button" onClick={onMenuOnly}>
            Continue with menu photos only
          </button>
        ) : null}
      </div>
    </main>
  );
}

export function RestaurantConfirmationExperience({ screens }) {
  const [activeState, setActiveState] = useState("candidate");
  const [selectedCandidateId, setSelectedCandidateId] = useState(null);
  const [submissionState, setSubmissionState] = useState("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const screen = screens[activeState];

  const previewStates = useMemo(
    () => Object.keys(STATE_LABELS).filter((state) => screens[state]),
    [screens],
  );

  const selectState = (state) => {
    setActiveState(state);
    setSelectedCandidateId(
      screens[state].candidates.find((candidate) => candidate.isSelected)
        ?.candidateId ?? null,
    );
    setSubmissionState("idle");
    setStatusMessage("");
  };

  const previewSubmission = (state) => {
    setActiveState("candidate");
    setSelectedCandidateId(screens.candidate.candidates[0]?.candidateId ?? null);
    setSubmissionState(state);
    setStatusMessage(
      state === "error"
        ? "The fixture choice could not be saved. Your selection is still here."
        : "",
    );
  };

  const confirmFixtureChoice = () => {
    setSubmissionState("loading");
    setStatusMessage("");
    window.setTimeout(() => {
      setSubmissionState("idle");
      setStatusMessage(
        "Fixture choice recorded locally. Server confirmation is not connected yet.",
      );
    }, 450);
  };

  const setLocalOutcome = (message) => {
    setSubmissionState("idle");
    setStatusMessage(message);
  };

  return (
    <>
      <aside className="preview-toolbar" aria-label="Fixture state previews">
        <fieldset>
          <legend>Preview a state</legend>
          <div className="preview-options">
            {previewStates.map((state) => (
              <button
                type="button"
                key={state}
                aria-pressed={activeState === state && submissionState === "idle"}
                onClick={() => selectState(state)}
              >
                {STATE_LABELS[state]}
              </button>
            ))}
            <button type="button" onClick={() => previewSubmission("loading")}>
              Loading
            </button>
            <button type="button" onClick={() => previewSubmission("error")}>
              Error
            </button>
          </div>
        </fieldset>
      </aside>
      <RestaurantConfirmationPanel
        screen={screen}
        selectedCandidateId={selectedCandidateId}
        submissionState={submissionState}
        statusMessage={statusMessage}
        onSelect={(candidateId) => {
          setSelectedCandidateId(candidateId);
          setSubmissionState("idle");
          setStatusMessage("");
        }}
        onConfirm={confirmFixtureChoice}
        onRetry={() =>
          setLocalOutcome("Retry is available; server matching is not connected yet.")
        }
        onMenuOnly={() =>
          setLocalOutcome("Menu-only continuation is ready for server integration.")
        }
        onContinue={() =>
          setLocalOutcome("Confirmed fixture is ready for menu analysis integration.")
        }
      />
    </>
  );
}
