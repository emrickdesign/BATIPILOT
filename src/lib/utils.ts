import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount)
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('fr-FR').format(new Date(date))
}

export function generateQuoteNumber(index: number): string {
  return `DEV-${new Date().getFullYear()}-${String(index).padStart(3, '0')}`
}

export function generateInvoiceNumber(index: number): string {
  return `FAC-${new Date().getFullYear()}-${String(index).padStart(3, '0')}`
}
