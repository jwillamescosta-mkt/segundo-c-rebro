import { motion, type HTMLMotionProps } from "motion/react";

/** Curva suave usada em todo o app. */
export const EASE = [0.22, 1, 0.36, 1] as const;

/** Aparece subindo quando entra na tela (scroll). */
export function Reveal({ delay = 0, ...props }: HTMLMotionProps<"div"> & { delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5, ease: EASE, delay }}
      {...props}
    />
  );
}

const list = { hidden: {}, show: { transition: { staggerChildren: 0.045 } } };
const item = {
  hidden: { opacity: 0, x: -8 },
  show: { opacity: 1, x: 0, transition: { duration: 0.35, ease: EASE } },
};

/** Lista cujos itens entram em cascata ao aparecer na tela. */
export function StaggerList(props: HTMLMotionProps<"ul">) {
  return <motion.ul variants={list} initial="hidden" whileInView="show" viewport={{ once: true }} {...props} />;
}

/** Item de StaggerList com leve deslocamento no hover. */
export function StaggerItem(props: HTMLMotionProps<"li">) {
  return <motion.li variants={item} whileHover={{ x: 3 }} transition={{ type: "spring", stiffness: 400, damping: 30 }} {...props} />;
}
