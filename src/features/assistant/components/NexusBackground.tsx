const particles = Array.from({ length: 28 }, (_, index) => ({
  left: `${(index * 37 + 11) % 100}%`,
  top: `${(index * 53 + 7) % 100}%`,
  delay: `${-((index * 7) % 20) / 10}s`,
  size: `${1 + ((index * 3) % 3)}px`,
}));

export function NexusBackground() {
  return (
    <div className="nexus-background" aria-hidden="true">
      <div className="nexus-background__grid" />
      <div className="nexus-background__scanline" />
      {particles.map((particle, index) => (
        <span
          className="nexus-background__particle"
          key={index}
          style={{
            left: particle.left,
            top: particle.top,
            animationDelay: particle.delay,
            width: particle.size,
            height: particle.size,
          }}
        />
      ))}
    </div>
  );
}
