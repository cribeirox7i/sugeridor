"use client";

type ServerAction = (formData: FormData) => void | Promise<void>;

// Form de exclusão com confirmação — usado em todo o admin. Recebe a Server
// Action já pronta (saveStore/deleteProduct/deleteOffer etc.), só embrulha
// com um confirm() do navegador antes de deixar o submit seguir.
export default function DeleteButton({
  action,
  id,
  label,
  confirmMessage,
  className,
}: {
  action: ServerAction;
  id: string;
  label: string;
  confirmMessage: string;
  className?: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(confirmMessage)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className={className}>
        {label}
      </button>
    </form>
  );
}
