import re

with open('src/features/seed/payments/packing/PackingSummary.jsx', 'r') as f:
    content = f.read()

old_btn = """        <button
          type="button"
          onClick={onGoToHistory}
          className="btn-success px-8 py-3 font-extrabold text-sm shadow-md"
        >
          Confirm & Save Packing ➔
        </button>"""

new_btn = """        <button
          type="button"
          onClick={onGoToHistory}
          className="btn-success px-8 py-3 font-extrabold text-sm shadow-md"
        >
          Confirm & Continue to Outside Workers ➔
        </button>"""

content = content.replace(old_btn, new_btn)

with open('src/features/seed/payments/packing/PackingSummary.jsx', 'w') as f:
    f.write(content)
