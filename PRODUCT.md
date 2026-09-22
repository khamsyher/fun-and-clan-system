# Fund & Clan Management System

Multi-tenant web app for Lao clans ("Seng") to run funeral mutual-aid funds. Each clan's data is isolated; the platform owner takes a configurable fee (default 1.5%) of donations collected per funeral event. Currency: Lao Kip (₭).

## Users
- **Super Admin** (platform owner): creates/enables/disables clans, sets platform fee, sees overall stats. Cannot touch a clan's central fund.
- **Clan Leader** (clan_admin): approves new members, chooses fund mode (A pre-collected / B collect on demand), sets the contribution rate (changes require uploaded meeting minutes), reports deaths, approves disbursements, pulls reports.
- **Member**: registers with a clan code, waits for approval, adds dependents, uploads transfer slips, tracks history and outstanding debt.

## Context of use
Mostly phones, often older relatives, sometimes on weak connections. The subject is death and money, so the tone is calm, respectful and plainly trustworthy — never playful, never salesy.

## Decisions
- UI languages: English (default), Lao (ພາສາລາວ) and White Hmong (Hmoob, RPA), switched from a language button; choice is kept in a `lang` cookie.
- Login: phone number + password.
- Visual direction: calm, trustworthy, premium blue — deep royal navy primary (#12357a), cool porcelain surfaces, restrained champagne-gold accent.
- Stack: Next.js 16 (App Router), Tailwind v4, PostgreSQL via `pg` (no ORM), managed in Navicat.
