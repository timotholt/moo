import React from 'react';
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import { DESIGN_SYSTEM } from '../theme/designSystem.js';

// Simple, dependency-free confetti effect centered around a target element.
// This is intentionally lightweight: a handful of absolutely positioned divs
// with a short CSS keyframe animation.
let completeButtonConfettiStylesInjected = false;

function ensureConfettiStyles() {
  if (completeButtonConfettiStylesInjected) return;
  if (typeof document === 'undefined') return;

  const style = document.createElement('style');
  style.textContent = `
    @keyframes complete-button-confetti-fall {
      0% {
        transform: translate3d(0, 0, 0) rotate(0deg);
        opacity: 1;
      }
      100% {
        transform: translate3d(var(--confetti-dx), var(--confetti-dy), 0) rotate(720deg);
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(style);
  completeButtonConfettiStylesInjected = true;
}

function launchConfettiForItemType(itemType, event, { isFinalActor = false } = {}) {
  if (typeof document === 'undefined' || !event || !event.currentTarget) return;

  ensureConfettiStyles();

  const rect = event.currentTarget.getBoundingClientRect();
  const originX = rect.left + rect.width / 2;
  const originY = rect.top + rect.height / 2;

  const colors = ['#ffffff', '#8bc34a', '#c5e1a5', '#aed581'];

  let particleCount = 24;
  if (itemType === 'section') particleCount = 48;
  else if (itemType === 'actor') particleCount = 120; // denser for actors

  const createParticle = (startX, startY, maxDistance, sizeBase, durationMs = 600) => {
    const el = document.createElement('div');
    const angle = Math.random() * Math.PI * 2;
    const distance = 40 + Math.random() * maxDistance;
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance;

    const size = sizeBase + Math.random() * 3;

    el.style.position = 'fixed';
    el.style.left = `${startX}px`;
    el.style.top = `${startY}px`;
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    el.style.borderRadius = '50%';
    el.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    el.style.pointerEvents = 'none';
    el.style.zIndex = 9999;
    el.style.setProperty('--confetti-dx', `${dx}px`);
    el.style.setProperty('--confetti-dy', `${dy}px`);
    el.style.animation = `complete-button-confetti-fall ${durationMs}ms ease-out forwards`;

    document.body.appendChild(el);
    setTimeout(() => {
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
    }, durationMs + 100);
  };

  // Base burst around the button
  for (let i = 0; i < particleCount; i++) {
    const sizeBase = itemType === 'actor' ? 6 : itemType === 'section' ? 5 : 4;
    const maxDistance = itemType === 'actor' ? Math.max(window.innerWidth, window.innerHeight) : itemType === 'section' ? 200 : 120;
    createParticle(originX, originY, maxDistance, sizeBase, itemType === 'actor' ? 900 : 600);
  }

  // If this is the final actor being completed, launch a short full-viewport
  // fireworks-style celebration lasting about a second.
  if (itemType === 'actor' && isFinalActor) {
    const bursts = 5;
    const burstInterval = 180; // ~5 bursts over ~1 second

    for (let b = 0; b < bursts; b++) {
      setTimeout(() => {
        const centerX = window.innerWidth * (0.2 + 0.6 * Math.random());
        const centerY = window.innerHeight * (0.2 + 0.6 * Math.random());
        const burstParticles = 40;
        for (let i = 0; i < burstParticles; i++) {
          createParticle(centerX, centerY, Math.max(window.innerWidth, window.innerHeight) * 0.6, 6, 900);
        }
      }, b * burstInterval);
    }
  }
}

/**
 * Reusable complete/incomplete toggle button with consistent styling and tooltip
 * @param {boolean} isComplete - Whether the item is marked complete
 * @param {function} onToggle - Callback when button is clicked
 * @param {boolean} disabled - Whether the button is disabled
 * @param {string} itemType - Type of item (e.g., "section", "actor", "cue")
 * @param {number} approvedCount - For cues, the number of approved takes (optional)
 */
export default function CompleteButton({ 
  isComplete, 
  onToggle, 
  disabled = false,
  itemType = 'item',
  approvedCount = null,
  disabledReason = null,
  isFinalActor = false,
}) {
  // For cues, require at least one approved take before marking complete
  const canMarkComplete = approvedCount === null || approvedCount > 0;
  const isDisabled = disabled || (!isComplete && !canMarkComplete);

  const getTooltipText = () => {
    if (isComplete) {
      return `Mark ${itemType} as incomplete`;
    }
    // If caller provided a specific reason for disabling, surface it
    if (!isComplete && disabledReason && isDisabled && canMarkComplete) {
      return disabledReason;
    }
    if (!canMarkComplete) {
      return 'At least one take must be approved before marking this cue complete';
    }
    return `Mark this ${itemType} as complete`;
  };

  return (
    <Tooltip 
      title={getTooltipText()}
      arrow
      placement="left"
    >
      <span>
        <Button
          variant={isComplete ? 'contained' : 'outlined'}
          size="small"
          color="success"
          disabled={isDisabled}
          onClick={(event) => {
            // Only fire confetti when transitioning from incomplete -> complete
            // and the button is actually enabled.
            if (!isComplete && !isDisabled) {
              launchConfettiForItemType(itemType, event, { isFinalActor });
            }
            onToggle();
          }}
          sx={{ 
            ...DESIGN_SYSTEM.typography.small,
            textTransform: 'none',
            fontWeight: 500,
            // Completed: solid green background, bright white text (like approved take)
            ...(isComplete && {
              color: 'common.white',
            }),
          }}
        >
          {isComplete ? 'completed ✓' : `mark ${itemType} as completed`}
        </Button>
      </span>
    </Tooltip>
  );
}
