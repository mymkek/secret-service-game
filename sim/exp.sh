#!/usr/bin/env bash
# Короткий эксперимент: exp.sh <метка> <боты> [--set K=V]... — печатает строки таблицы исходов.
label=$1; bots=$2; shift 2
npx tsx sim/run.ts --n ${N:-500} --bots "$bots" --label "$label" "$@" 2>/dev/null | sed -n '/## Исходы/,/## Месяц/p' | grep -E "^\| [a-z0-9]" | sed "s/^/$label /"
