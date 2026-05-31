import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  // Drive est volontairement light-only (palette cream + sapin + or).
  // Force theme="light" pour que les toasts ne s'inversent JAMAIS en
  // dark quand le user a prefers-color-scheme:dark sur son téléphone
  // (sinon toast noir/blanc débarque sur fond cream — clash visuel).
  return (
    <Sonner
      theme="light"
      className="toaster group"
      position="top-center"
      offset="calc(env(safe-area-inset-top) + 12px)"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
