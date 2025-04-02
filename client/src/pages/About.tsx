import { motion, useAnimation } from "framer-motion";
import { useEffect } from "react";
import SecurityIcon from "@mui/icons-material/Security";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import LockIcon from "@mui/icons-material/Lock";
import PublicIcon from "@mui/icons-material/Public";
import GroupIcon from "@mui/icons-material/Group";
import { useInView } from "react-intersection-observer";
import "./About.css"

interface AboutSection {
  title: string;
  content: string;
  icon: JSX.Element;
}

const aboutSections: AboutSection[] = [
  {
    title: "About",
    content:
      `Lokr is more than just a file-sharing service—it's a movement toward reclaiming your digital rights. 
      In an age where every click and upload can be tracked, Lokr empowers you with a platform built on robust 
      privacy and security, ensuring your data stays yours.`,
    icon: <GroupIcon sx={{width: 80, height: 80}} />,
  },
  {
    title: "Privacy and Security First",
    content:
      `At Lokr, we believe that privacy is a fundamental human right. With increasing surveillance and data exploitation, 
      oppressive regimes and large corporations alike have tried to strip away individual freedoms under the guise of safety 
      and efficiency. Our response is clear: a platform where your files are shielded by end-to-end encryption, making sure 
      that no one—not even the server—can read your data. Every file you send is protected by cutting-edge cryptographic 
      protocols, ensuring that even if an attacker gains access, your sensitive information remains completely unreadable.`,
    icon: <SecurityIcon sx={{width: 80, height: 80}} />,
  },
  {
    title: "Seamless and Secure File Sharing",
    content:
      `Sharing files shouldn't mean sacrificing security. Lokr offers flexible sharing options via direct or link-based sharing. 
      Direct sharing allows you to share files with other registered users by specifying usernames, ensuring that only authorized 
      parties can access your content. Our link-based sharing allows for the generation share links that can be password protected 
      with customizable expiration times, allowing you to control who can view your files, even if the link is distributed widely. 
      Our system is built to balance usability with uncompromising security, so you can collaborate confidently while maintaining 
      full control over your data.`,
    icon: <InsertDriveFileIcon sx={{width: 80, height: 80}} />,
  },
  {
    title: "Complete Anonymity",
    content:
      `For those who value complete anonymity, Lokr allows you to upload and share files without creating an account. 
      This feature gives you the power to disseminate information without leaving any personal trace.`,
    icon: <PublicIcon sx={{width: 80, height: 80}} />,
  },
  {
    title: "Our Commitment to You",
    content:
      `We are dedicated to continuously advancing our technology and security measures. Lokr is designed from the ground up 
      to protect your digital privacy, and we remain committed to researching and implementing the latest cryptographic 
      innovations. Join us in creating a safer digital landscape where privacy and anonymity aren't privileges, but rights for everyone.`,
    icon: <LockIcon sx={{width: 80, height: 80}} />,
  },
];

const About = () => {
  return (
    <div className="main">
      <h1>About Us</h1>
      <div className="about-body">
        {aboutSections.map((item, index) => (
          <AboutBox key={index} item={item} index={index} />
        ))}
      </div>
    </div>
  );
};

const AboutBox = ({ item, index }: { item: AboutSection; index: number }) => {
  const controls = useAnimation();
  const { ref, inView } = useInView({
    triggerOnce: true,
    threshold: 0.6,
  });

  useEffect(() => {
    if (inView) {
      controls.start("visible");
    }
  }, [controls, inView]);

  const isEven = index % 2 === 0;
  const boxVariants = {
    hidden: { opacity: 0, x: isEven ? -50 : 50 },
    visible: {
      opacity: 1,
      x: 0,
      transition: { duration: 0.8, delay: index * 0.02 },
    },
  };

  return (
    <motion.div
      ref={ref}
      className={`about-box ${isEven ? "left" : "right"}`}
      variants={boxVariants}
      initial="hidden"
      animate={controls}
    >
      {isEven ? (
        <>
          <div className="icon-container">{item.icon}</div>
          <div className="text-content">
            <h2>{item.title}</h2>
            <p>{item.content}</p>
          </div>
        </>
      ) : (
        <>
          <div className="text-content">
            <h2>{item.title}</h2>
            <p>{item.content}</p>
          </div>
          <div className="icon-container">{item.icon}</div>
        </>
      )}
    </motion.div>
  );
};

export default About;