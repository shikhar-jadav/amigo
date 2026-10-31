'use client';

import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  ArrowUp,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Pencil,
  X,
} from 'lucide-react';

export interface QuestionItem {
  question: string;
  options: string[];
  is_multi_select?: boolean;
}

export interface InterruptData {
  interruptId: string;
  questions: QuestionItem[];
  status?: 'pending' | 'submitted' | 'skipped';
  answers?: Record<number, string | string[]>;
  error?: string;
}

interface InterruptCardProps {
  interrupt: InterruptData;
  onSubmit: (interruptId: string, answers: Record<number, string | string[]>) => Promise<void> | void;
  onSkip?: (interruptId: string) => Promise<void> | void;
  isSubmitting?: boolean;
}

export const InterruptCard: React.FC<InterruptCardProps> = ({
  interrupt,
  onSubmit,
  onSkip,
  isSubmitting = false,
}) => {
  const { status = 'pending', answers: initialAnswers } = interrupt;
  const questions: QuestionItem[] = Array.isArray(interrupt.questions)
    ? interrupt.questions.map((question) => ({
        question: typeof question === 'string' ? question : question?.question || 'Please provide your response',
        options: typeof question === 'string'
          ? ['Yes', 'No']
          : Array.isArray(question?.options)
            ? question.options.filter((option): option is string => typeof option === 'string')
            : ['Yes', 'No'],
        is_multi_select: Boolean(question && typeof question === 'object' && question.is_multi_select),
      }))
    : [];

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string | string[]>>(() => {
    const normalized: Record<number, string | string[]> = {};
    Object.entries(initialAnswers || {}).forEach(([key, value]) => {
      const index = Number(key);
      if (!Number.isNaN(index)) normalized[index] = Array.isArray(value) ? value.map(String) : String(value ?? '');
    });
    return normalized;
  });
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [customIndexes, setCustomIndexes] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (!initialAnswers) return;
    setAnswers((current) => {
      const next = { ...current };
      Object.entries(initialAnswers).forEach(([key, value]) => {
        const index = Number(key);
        if (!Number.isNaN(index)) next[index] = Array.isArray(value) ? value.map(String) : String(value ?? '');
      });
      return next;
    });
  }, [initialAnswers]);

  const currentQuestion = questions[currentIndex] || { question: '', options: [] };
  const isMulti = Boolean(currentQuestion.is_multi_select);

  const canSubmit = questions.length > 0 && questions.every((question, index) => {
    const answer = answers[index];
    if (customIndexes[index]) {
      if (question.is_multi_select && Array.isArray(answer) && answer.length > 0) return true;
      return Boolean(drafts[index]?.trim());
    }
    if (Array.isArray(answer)) return answer.length > 0;
    if (typeof answer === 'string' && answer.trim()) return true;
    return question.options.length === 0 && Boolean(drafts[index]?.trim());
  });

  const handleSubmit = async () => {
    if (!canSubmit || isSubmitting) return;
    const submittedAnswers = { ...answers };
    questions.forEach((question, index) => {
      const draft = drafts[index]?.trim();
      if ((question.options.length === 0 || customIndexes[index]) && draft) {
        if (question.is_multi_select && Array.isArray(submittedAnswers[index])) {
          const selected = submittedAnswers[index] as string[];
          submittedAnswers[index] = selected.includes(draft) ? selected : [...selected, draft];
        } else {
          submittedAnswers[index] = draft;
        }
      }
    });
    await onSubmit(interrupt.interruptId, submittedAnswers);
  };

  const handleSkip = async () => {
    if (isSubmitting) return;
    if (onSkip) await onSkip(interrupt.interruptId);
    else await onSubmit(interrupt.interruptId, { 0: 'SKIPPED' });
  };

  const chooseOption = (option: string) => {
    if (isSubmitting) return;
    setAnswers((current) => {
      if (isMulti) {
        const selected = Array.isArray(current[currentIndex]) ? current[currentIndex] as string[] : [];
        return {
          ...current,
          [currentIndex]: selected.includes(option)
            ? selected.filter((item) => item !== option)
            : [...selected, option],
        };
      }
      return { ...current, [currentIndex]: option };
    });
    if (!isMulti && currentIndex < questions.length - 1) {
      setTimeout(() => setCurrentIndex((index) => Math.min(index + 1, questions.length - 1)), 160);
    }
  };

  const splitOption = (option: string) => {
    const match = option.match(/^([^-:]+)\s*[-:]\s*(.+)$/);
    return match
      ? { title: match[1].trim(), description: match[2].trim() }
      : { title: option, description: '' };
  };

  if (status === 'submitted' || status === 'skipped') {
    return (
      <div className="my-2 flex max-w-xl items-start gap-3 rounded-xl border border-neutral-800 bg-[#111111] px-4 py-3">
        <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-emerald-400" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-neutral-200">{status === 'skipped' ? 'Question skipped' : 'Answer sent'}</p>
          {status === 'submitted' && questions.map((question, index) => {
            const answer = answers[index] ?? initialAnswers?.[index];
            return (
              <p key={index} className="mt-1 text-sm text-neutral-400">
                <span className="text-neutral-500">{question.question} </span>
                {Array.isArray(answer) ? answer.join(', ') : String(answer || 'No answer')}
              </p>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <section className="my-3 w-full max-w-4xl overflow-hidden rounded-2xl border border-neutral-700 bg-[#303030] text-neutral-100 shadow-lg shadow-black/20">
      <header className="flex items-center gap-3 px-4 pb-3 pt-4 sm:px-5">
        <h3 className="min-w-0 flex-1 text-[15px] font-medium leading-6 text-neutral-100">
          {currentQuestion.question}
        </h3>
        {questions.length > 1 && (
          <div className="flex shrink-0 items-center gap-1 text-sm text-neutral-400">
            <button
              type="button"
              aria-label="Previous question"
              disabled={currentIndex === 0 || isSubmitting}
              onClick={() => setCurrentIndex((index) => Math.max(index - 1, 0))}
              className="rounded p-1 hover:text-white disabled:opacity-30"
            >
              <ChevronLeft size={16} />
            </button>
            <span>{currentIndex + 1} of {questions.length}</span>
            <button
              type="button"
              aria-label="Next question"
              disabled={currentIndex === questions.length - 1 || isSubmitting}
              onClick={() => setCurrentIndex((index) => Math.min(index + 1, questions.length - 1))}
              className="rounded p-1 hover:text-white disabled:opacity-30"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
        {questions.length > 1 && (
          <button
            type="button"
            onClick={() => void handleSkip()}
            disabled={isSubmitting}
            aria-label="Skip questions"
            className="shrink-0 rounded p-1 text-neutral-400 hover:text-white disabled:opacity-40"
          >
            <X size={16} />
          </button>
        )}
      </header>

      {interrupt.error && (
        <p role="alert" className="mx-2 mb-2 rounded-lg border border-red-900/60 bg-red-950/30 px-3 py-2 text-sm text-red-300 sm:mx-3">
          {interrupt.error}
        </p>
      )}

      <div className="mx-1 mb-1 px-1 sm:mx-1.5 sm:px-0.5">
        {currentQuestion.options.map((option, optionIndex) => {
          const selected = isMulti
            ? Array.isArray(answers[currentIndex]) && (answers[currentIndex] as string[]).includes(option)
            : answers[currentIndex] === option;
          const { title, description } = splitOption(option);
          return (
            <button
              type="button"
              key={`${option}-${optionIndex}`}
              disabled={isSubmitting}
              onClick={() => chooseOption(option)}
              className={`group flex w-full items-center gap-3 border-b border-neutral-600/70 px-2.5 py-2 text-left transition-colors last:border-b-0 hover:bg-white/[0.035] disabled:cursor-not-allowed disabled:opacity-60 sm:px-3 ${
                selected ? 'rounded-xl border border-blue-500 bg-[#3a3a3a]' : 'rounded-lg'
              }`}
            >
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-sm ${
                selected ? 'bg-blue-500 text-white' : isMulti ? 'border border-neutral-500 text-neutral-400' : 'bg-[#414141] text-neutral-200'
              }`}>
                {selected && isMulti ? <Check size={16} strokeWidth={3} /> : optionIndex + 1}
              </span>
              <span className="min-w-0 flex-1 py-0.5">
                <span className={`block text-[15px] leading-5 ${selected ? 'text-white' : 'text-neutral-100'}`}>{title}</span>
                {description && <span className="mt-0.5 block text-sm leading-5 text-neutral-400">{description}</span>}
              </span>
              {!isMulti && <ArrowRight size={17} className="mr-1 shrink-0 text-neutral-400 group-hover:text-white" />}
            </button>
          );
        })}

        {customIndexes[currentIndex] ? (
          <div className="flex items-center gap-2 border-t border-neutral-600/70 px-3 py-2.5">
            <Pencil size={16} className="shrink-0 text-blue-300" />
            <input
              autoFocus
              type="text"
              disabled={isSubmitting}
              value={drafts[currentIndex] || ''}
              onChange={(event) => setDrafts((current) => ({ ...current, [currentIndex]: event.target.value }))}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void handleSubmit();
                }
              }}
              placeholder="Type your answer..."
              aria-label="Something else"
              className="min-w-0 flex-1 bg-transparent py-1 text-[15px] text-white outline-none placeholder:text-neutral-400"
            />
            <button
              type="button"
              onClick={() => void handleSkip()}
              disabled={isSubmitting}
              className="rounded-lg bg-[#494949] px-3 py-1.5 text-sm text-white hover:bg-[#555] disabled:opacity-40"
            >
              Skip
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={!canSubmit || isSubmitting}
              aria-label="Submit answer"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-600 text-white transition-colors hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ArrowUp size={18} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3 border-t border-neutral-600/70 px-3 py-2">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => {
                setCustomIndexes((current) => ({ ...current, [currentIndex]: true }));
                if (!isMulti) {
                  setAnswers((current) => {
                    const next = { ...current };
                    delete next[currentIndex];
                    return next;
                  });
                }
              }}
              className="flex min-h-8 flex-1 items-center gap-3 text-left text-sm text-neutral-400 transition-colors hover:text-neutral-200 disabled:opacity-50"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#414141] text-blue-300">
                <Pencil size={15} />
              </span>
              Something else
            </button>
            <button
              type="button"
              onClick={() => void handleSkip()}
              disabled={isSubmitting}
              className="rounded-lg bg-[#494949] px-3 py-1.5 text-sm text-white transition-colors hover:bg-[#555] disabled:opacity-40"
            >
              Skip
            </button>
            {(canSubmit || isMulti) && (
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={!canSubmit || isSubmitting}
                aria-label="Submit answer"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-600 text-white transition-colors hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ArrowUp size={18} />
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
