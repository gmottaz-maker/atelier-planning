// Champ quantité : pas de 0.5, mais un premier clic sur la flèche haut depuis
// un champ vide donne 1 (et non 0.5), ce qui est le cas courant à la saisie.
export default function QtyInput({ value, onChange, className }) {
  return (
    <input
      type="number"
      step="0.5"
      min="0"
      className={className}
      value={value ?? ''}
      onChange={e => {
        const raw = e.target.value
        const oldNum = parseFloat(value)
        const newNum = parseFloat(raw)
        const wasEmpty = value === '' || value == null || oldNum === 0
        if (wasEmpty && newNum === 0.5) { onChange('1'); return }
        onChange(raw)
      }}
    />
  )
}
