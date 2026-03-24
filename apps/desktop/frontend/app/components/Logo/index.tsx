import { NextPage } from 'next'
import Image from 'next/image'

interface Props {}

const LogoComponent: NextPage<Props> = ({}) => {
  return    <Image
                src="/logo.png"
                alt="logo"
                width={180}
                height={90}
                className="object-contain w-full h-auto"
                priority
            />
}

export default LogoComponent